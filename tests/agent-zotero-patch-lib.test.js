import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  applyPatchPlan,
  derivePatchPlan,
  evaluatePatchVerificationContract,
} from "../scripts/agent-zotero-patch-lib.mjs";

describe("Agent Zotero Patch Lib", () => {
  it("should derive a review-ready patch plan for whitelisted registration issues", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "item-pane:item-pane-section-missing",
        feature: "item-pane",
        featureLabel: "ItemPane 注册",
        candidateFiles: [
          "src/features/item-pane.js",
        ],
      },
    });

    assert.equal(plan.status, "review-ready");
    assert.equal(plan.whitelisted, true);
    assert.equal(plan.mode, "review-only");
    assert.ok(Array.isArray(plan.allowedTargets));
    assert.ok(plan.allowedTargets.includes("src/features/item-pane.js"));
    assert.ok(plan.allowedTargets.includes("src/app/feature-composer.js"));
    assert.ok(Array.isArray(plan.patchDrafts));
    assert.ok(plan.patchDrafts.length > 0);
    assert.ok(String(plan.patchDrafts[0].patch).includes("itemPane.registerSection"));
    assert.ok(Array.isArray(plan.guardrails));
    assert.ok(plan.guardrails.length > 0);
    assert.equal(plan.verificationContract.summary.includes("ItemPane Section"), true);
    assert.equal(plan.verificationContract.checks[0].id, "item-pane-section-count");
    assert.equal(plan.verificationContract.checks[0].kind, "all-cycle-check");
    assert.equal(plan.verificationContract.checks.some((check) => check.id === "test-failed-count" && check.required === false), true);
    assert.equal(plan.verificationContract.checks.some((check) => check.id === "service-degraded-cycle-count" && check.required === false), true);
  });

  it("should derive a create patch plan for missing bootstrap startup file", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "bootstrap:bootstrap-file-missing",
        feature: "bootstrap",
        featureLabel: "启动与挂载",
        candidateFiles: [
          "addon-static/bootstrap.js",
        ],
      },
    });

    assert.equal(plan.status, "review-ready");
    assert.equal(plan.whitelisted, true);
    assert.equal(plan.whitelistRuleId, "bootstrap-startup-script-file");
    assert.ok(plan.allowedTargets.includes("addon-static/bootstrap.js"));
    assert.equal(plan.patchDrafts[0].operation, "create");
    assert.equal(plan.patchDrafts[0].file, "addon-static/bootstrap.js");
    assert.ok(String(plan.patchDrafts[0].snippet).includes("function _installCapabilityWhitelist"));
    assert.equal(plan.verificationContract.checks[0].id, "plugin-mounted");
    assert.equal(plan.verificationContract.checks.some((check) => check.id === "static-runtime-missing-count"), true);
    assert.equal(plan.verificationContract.checks.some((check) => check.id === "service-degraded-cycle-count" && check.required === false), true);
    assert.equal(plan.postApplyVerification?.strategy, "restart");
  });

  it("should derive a copy patch plan for drifted bootstrap startup file", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "bootstrap:bootstrap-file-drift",
        feature: "bootstrap",
        featureLabel: "启动与挂载",
        candidateFiles: [
          "addon-static/bootstrap.js",
        ],
      },
    });

    assert.equal(plan.status, "review-ready");
    assert.equal(plan.whitelisted, true);
    assert.equal(plan.whitelistRuleId, "bootstrap-startup-script-file");
    assert.equal(plan.patchDrafts[0].operation, "copy");
    assert.equal(plan.patchDrafts[0].file, "addon-static/bootstrap.js");
    assert.equal(plan.patchDrafts[0].sourceFile, "scripts/baselines/bootstrap.js.txt");
    assert.ok(typeof plan.patchDrafts[0].expectedSourceSha256 === "string");
    assert.equal(plan.verificationContract.checks.some((check) => check.id === "static-runtime-drift-count"), true);
  });

  it("should derive a copy patch plan for missing icon resource file", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "assets:icon-resource-missing",
        feature: "assets",
        featureLabel: "静态资源与图标",
        issue: "静态运行时基线缺失：addon-static/content/icons/icon-48.png（配置声明的 icon 资源）。",
        candidateFiles: [
          "config/addon.config.json",
          "addon-static/content/icons/icon-48.png",
          "addon-static/content/icons/icon-96.png",
        ],
      },
    });

    assert.equal(plan.status, "review-ready");
    assert.equal(plan.whitelisted, true);
    assert.equal(plan.whitelistRuleId, "assets-icon-resource-file");
    assert.equal(plan.patchDrafts.length, 1);
    assert.equal(plan.patchDrafts[0].operation, "copy");
    assert.equal(plan.patchDrafts[0].file, "addon-static/content/icons/icon-48.png");
    assert.equal(plan.patchDrafts[0].sourceFile, "scripts/baselines/icons/icon-48.png");
    assert.ok(typeof plan.patchDrafts[0].expectedSourceSha256 === "string");
    assert.equal(plan.verificationContract.checks[0].id, "cycle-failed-count");
    assert.equal(plan.verificationContract.checks.some((check) => check.id === "static-runtime-missing-count"), true);
    assert.equal(plan.verificationContract.checks.some((check) => check.id === "service-degraded-cycle-count" && check.required === false), true);
  });

  it("should derive a copy patch plan for drifted icon resource file", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "assets:icon-resource-drift",
        feature: "assets",
        featureLabel: "静态资源与图标",
        issue: "静态运行时基线漂移：addon-static/content/icons/icon-96.png（配置声明的 icon 资源）。",
        candidateFiles: [
          "config/addon.config.json",
          "addon-static/content/icons/icon-96.png",
        ],
      },
    });

    assert.equal(plan.status, "review-ready");
    assert.equal(plan.whitelistRuleId, "assets-icon-resource-file");
    assert.equal(plan.patchDrafts[0].operation, "copy");
    assert.equal(plan.patchDrafts[0].file, "addon-static/content/icons/icon-96.png");
    assert.equal(plan.patchDrafts[0].sourceFile, "scripts/baselines/icons/icon-96.png");
    assert.equal(plan.verificationContract.checks.some((check) => check.id === "static-runtime-drift-count"), true);
  });

  it("should classify unsupported diagnoses with stable blocker metadata", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "menu-action:primary-action-failed",
        feature: "menu-action",
        featureLabel: "主动作执行",
        candidateFiles: [
          "src/commands/run-primary-action.js",
        ],
      },
    });

    assert.equal(plan.status, "no-whitelist-match");
    assert.equal(plan.unsupportedDiagnosisCategory, "behavioral-regression");
    assert.equal(plan.unsupportedDiagnosisCategoryLabel, "行为回归");
    assert.ok(String(plan.unsupportedDiagnosisReason).includes("动作执行结果异常"));
  });

  it("should derive a copy patch plan for drifted preference pane resource file", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "preferences:preference-pane-resource-drift",
        feature: "preferences",
        featureLabel: "偏好设置面板",
        candidateFiles: [
          "addon-static/content/preferences.xhtml",
        ],
      },
    });

    assert.equal(plan.status, "review-ready");
    assert.equal(plan.whitelisted, true);
    assert.equal(plan.whitelistRuleId, "preferences-pane-resource-file");
    assert.equal(plan.patchDrafts[0].operation, "copy");
    assert.equal(plan.patchDrafts[0].file, "addon-static/content/preferences.xhtml");
    assert.equal(plan.patchDrafts[0].sourceFile, "scripts/baselines/preferences.xhtml.txt");
    assert.equal(plan.verificationContract.checks.some((check) => check.id === "static-runtime-drift-count"), true);
  });

  it("should derive a copy patch plan for drifted runtime style resource file", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "runtime-logs:style-sheet-resource-drift",
        feature: "runtime-logs",
        featureLabel: "运行时日志与资源加载",
        candidateFiles: [
          "addon-static/content/style/main.css",
        ],
      },
    });

    assert.equal(plan.status, "review-ready");
    assert.equal(plan.whitelisted, true);
    assert.equal(plan.whitelistRuleId, "runtime-style-sheet-resource-file");
    assert.equal(plan.patchDrafts[0].operation, "copy");
    assert.equal(plan.patchDrafts[0].file, "addon-static/content/style/main.css");
    assert.equal(plan.patchDrafts[0].sourceFile, "scripts/baselines/main.css.txt");
    assert.equal(plan.verificationContract.checks.some((check) => check.id === "static-runtime-drift-count"), true);
  });

  it("should derive a review-ready patch plan for lifecycle baseline registration gaps", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "lifecycle:baseline-registration-missing",
        feature: "lifecycle",
        featureLabel: "生命周期与基线注册",
        candidateFiles: [
          "src/app/kernel.js",
        ],
      },
    });

    assert.equal(plan.status, "review-ready");
    assert.equal(plan.whitelisted, true);
    assert.equal(plan.feature, "lifecycle");
    assert.ok(plan.allowedTargets.includes("src/app/kernel.js"));
    assert.equal(plan.patchDrafts[0].file, "src/app/kernel.js");
    assert.ok(String(plan.patchDrafts[0].patch).includes("registerBaselineFeatures"));
    assert.equal(plan.verificationContract.checks.length, 7);
    assert.equal(plan.verificationContract.checks.some((check) => check.id === "test-failed-count" && check.required === false), true);
    assert.equal(plan.verificationContract.checks.some((check) => check.id === "service-degraded-cycle-count" && check.required === false), true);
  });

  it("should derive a review-ready patch plan for config default enabled drift", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "config:default-enabled-disabled",
        feature: "config",
        featureLabel: "默认配置修正",
        candidateFiles: [
          "config/addon.config.json",
        ],
      },
    });

    assert.equal(plan.status, "review-ready");
    assert.equal(plan.whitelisted, true);
    assert.equal(plan.feature, "config");
    assert.ok(plan.allowedTargets.includes("config/addon.config.json"));
    assert.equal(plan.patchDrafts[0].operation, "replace");
    assert.equal(plan.patchDrafts[0].file, "config/addon.config.json");
    assert.equal(plan.postApplyVerification.fresh, true);
  });

  it("should derive a dynamic review-ready patch plan for item pane l10n drift", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "localization:item-pane-info-row-l10n-id-drift",
        feature: "localization",
        featureLabel: "本地化引用修正",
        issue: "ItemPane InfoRow l10nID 漂移：期望 cleanroom-item-pane-info-row-label，实际 cleanroom-item-pane-info-row-label-typo。",
        candidateFiles: [
          "src/app/feature-composer.js",
        ],
      },
    });

    assert.equal(plan.status, "review-ready");
    assert.equal(plan.whitelisted, true);
    assert.equal(plan.feature, "localization");
    assert.ok(plan.allowedTargets.includes("src/app/feature-composer.js"));
    assert.equal(plan.patchDrafts[0].operation, "replace");
    assert.ok(String(plan.patchDrafts[0].matchText).includes("cleanroom-item-pane-info-row-label-typo"));
    assert.ok(String(plan.patchDrafts[0].replacementText).includes("cleanroom-item-pane-info-row-label"));
  });

  it("should derive a dynamic review-ready patch plan for missing locale ftl key", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "localization:item-pane-section-header-ftl-key-missing",
        feature: "localization",
        featureLabel: "本地化引用修正",
        issue: "Locale zh-CN 缺少 FTL key cleanroom-item-pane-section-header。",
        candidateFiles: [
          "addon-static/locale/zh-CN/main.ftl",
        ],
      },
    });

    assert.equal(plan.status, "review-ready");
    assert.equal(plan.whitelisted, true);
    assert.equal(plan.patchDrafts[0].operation, "append");
    assert.equal(plan.patchDrafts[0].file, "addon-static/locale/zh-CN/main.ftl");
    assert.ok(String(plan.patchDrafts[0].snippet).includes("cleanroom-item-pane-section-header =\n    .label = 模板示例"));
  });

  it("should derive a create patch when locale main ftl file is missing", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "localization:item-pane-section-header-ftl-key-missing",
        feature: "localization",
        featureLabel: "本地化引用修正",
        issue: "Locale zh-CN 缺少 FTL key cleanroom-item-pane-section-header（文件 addon-static/locale/zh-CN/main.ftl 不存在）。",
        candidateFiles: [
          "addon-static/locale/zh-CN/main.ftl",
        ],
      },
    });

    assert.equal(plan.status, "review-ready");
    assert.equal(plan.whitelisted, true);
    assert.equal(plan.patchDrafts[0].operation, "create");
    assert.equal(plan.patchDrafts[0].file, "addon-static/locale/zh-CN/main.ftl");
    assert.ok(String(plan.patchDrafts[0].snippet).includes("cleanroom-dialog-body = 插件命令执行成功。"));
    assert.ok(String(plan.patchDrafts[0].snippet).includes("cleanroom-item-pane-section-header =\n    .label = 模板示例"));
  });

  it("should derive a dynamic review-ready patch plan for locale ftl value drift", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "localization:item-pane-section-header-ftl-value-drift",
        feature: "localization",
        featureLabel: "本地化引用修正",
        issue: "Locale zh-CN FTL key cleanroom-item-pane-section-header 值漂移：期望 模板示例，实际 模板示例-错误。 实际定义片段 [cleanroom-item-pane-section-header =\\n    .label = 模板示例-错误]。",
        candidateFiles: [
          "addon-static/locale/zh-CN/main.ftl",
        ],
      },
    });

    assert.equal(plan.status, "review-ready");
    assert.equal(plan.whitelisted, true);
    assert.equal(plan.patchDrafts[0].operation, "replace-block");
    assert.equal(plan.patchDrafts[0].file, "addon-static/locale/zh-CN/main.ftl");
    assert.equal(String(plan.patchDrafts[0].startText), "cleanroom-item-pane-section-header =");
    assert.equal(String(plan.patchDrafts[0].endText), "    .label = 模板示例-错误");
    assert.ok(String(plan.patchDrafts[0].replacementText).includes("cleanroom-item-pane-section-header =\n    .label = 模板示例"));
  });

  it("should derive a dynamic review-ready patch plan for locale ftl structure drift", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "localization:item-pane-section-header-ftl-structure-drift",
        feature: "localization",
        featureLabel: "本地化引用修正",
        issue: "Locale zh-CN FTL key cleanroom-item-pane-section-header 结构漂移：期望定义片段 [cleanroom-item-pane-section-header =\\n    .label = 模板示例]，实际定义片段 [cleanroom-item-pane-section-header = 模板示例]。",
        candidateFiles: [
          "addon-static/locale/zh-CN/main.ftl",
        ],
      },
    });

    assert.equal(plan.status, "review-ready");
    assert.equal(plan.whitelisted, true);
    assert.equal(plan.patchDrafts[0].operation, "replace");
    assert.equal(plan.patchDrafts[0].file, "addon-static/locale/zh-CN/main.ftl");
    assert.equal(String(plan.patchDrafts[0].matchText), "cleanroom-item-pane-section-header = 模板示例");
    assert.ok(String(plan.patchDrafts[0].replacementText).includes("cleanroom-item-pane-section-header =\n    .label = 模板示例"));
  });

  it("should derive a review-ready patch plan for reader visual baseline drift", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-visual-plan-"));
    const sourceFile = path.join(tempRoot, "dist", "agent-zotero-e2e-assets", "cycle-2-reader.png");
    const targetFile = path.join(tempRoot, "tests", "visual-baselines", "agent-zotero-e2e", "hot-reload-reader.png");
    fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
    fs.writeFileSync(sourceFile, Buffer.from("reader-visual-source"));
    const sourceHash = crypto.createHash("sha256").update(fs.readFileSync(sourceFile)).digest("hex");

    const plan = derivePatchPlan({
      projectRoot: tempRoot,
      passed: false,
      primaryDiagnosis: {
        fingerprint: "reader-ui:reader-visual-drift",
        feature: "reader-ui",
        featureLabel: "Reader 与视觉回归",
        candidateFiles: [
          "tests/visual-baselines/agent-zotero-e2e/hot-reload-reader.png",
        ],
      },
      cycles: [{
        index: 2,
        bootMode: "hot-reload",
        visuals: {
          captures: [{
            kind: "reader",
            path: sourceFile,
            analysis: {
              sha256: sourceHash,
            },
          }],
          analysis: {
            baselines: [{
              kind: "reader",
              bootMode: "hot-reload",
              path: targetFile,
              status: "compared",
              ok: false,
            }],
          },
        },
      }],
    });

    assert.equal(plan.status, "review-ready");
    assert.equal(plan.whitelisted, true);
    assert.equal(plan.whitelistRuleId, "reader-visual-baseline-refresh");
    assert.equal(plan.patchDrafts[0].operation, "copy");
    assert.equal(plan.patchDrafts[0].file, "tests/visual-baselines/agent-zotero-e2e/hot-reload-reader.png");
    assert.equal(plan.patchDrafts[0].sourceFile, "dist/agent-zotero-e2e-assets/cycle-2-reader.png");
    assert.equal(plan.patchDrafts[0].expectedSourceSha256, sourceHash);
    assert.equal(plan.verificationContract.checks[0].id, "visual-drift-count");
    assert.equal(plan.verificationContract.checks.some((check) => check.id === "visual-missing-count"), true);
    assert.equal(plan.verificationContract.checks.some((check) => check.id === "visual-error-count"), true);
  });

  it("should derive a canonical visual baseline target even when report baseline path is tampered", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-visual-canonical-"));
    const sourceFile = path.join(tempRoot, "dist", "agent-zotero-e2e-assets", "cycle-2-reader.png");
    const tamperedTargetFile = path.join(tempRoot, "README.md");
    fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
    fs.writeFileSync(sourceFile, Buffer.from("reader-visual-source"));
    const sourceHash = crypto.createHash("sha256").update(fs.readFileSync(sourceFile)).digest("hex");

    const plan = derivePatchPlan({
      projectRoot: tempRoot,
      passed: false,
      primaryDiagnosis: {
        fingerprint: "reader-ui:reader-visual-drift",
        feature: "reader-ui",
        featureLabel: "Reader 与视觉回归",
        candidateFiles: [
          "tests/visual-baselines/agent-zotero-e2e/hot-reload-reader.png",
        ],
      },
      cycles: [{
        index: 2,
        bootMode: "hot-reload",
        visuals: {
          captures: [{
            kind: "reader",
            path: sourceFile,
            analysis: {
              sha256: sourceHash,
            },
          }],
          analysis: {
            baselines: [{
              kind: "reader",
              bootMode: "hot-reload",
              path: tamperedTargetFile,
              status: "compared",
              ok: false,
            }],
          },
        },
      }],
    });

    assert.equal(plan.status, "review-ready");
    assert.equal(plan.patchDrafts[0].file, "tests/visual-baselines/agent-zotero-e2e/hot-reload-reader.png");
  });

  it("should derive a review-ready patch plan for missing reader summary command registration", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "reader-entry:reader-summary-command-missing",
        feature: "reader-entry",
        featureLabel: "Reader 命令与菜单入口",
        candidateFiles: [
          "src/app/feature-composer.js",
        ],
      },
    });

    assert.equal(plan.status, "review-ready");
    assert.equal(plan.whitelisted, true);
    assert.equal(plan.whitelistRuleId, "reader-entry-declarative-mapping");
    assert.ok(plan.allowedTargets.includes("src/app/feature-composer.js"));
    assert.equal(plan.patchDrafts[0].operation, "insert");
    assert.equal(plan.verificationContract.checks[0].kind, "all-cycle-check");
    assert.ok(String(plan.patchDrafts[0].patch).includes("reader-summary"));
    assert.equal(plan.verificationContract.checks[0].id, "reader-summary-command-registered");
  });

  it("should normalize legacy reader-entry alias to canonical fingerprint in patch plan output", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "reader-entry:reader-summary-command-missing",
        feature: "reader-entry",
        featureLabel: "Reader 命令与菜单入口",
        candidateFiles: [
          "src/app/feature-composer.js",
        ],
      },
    });

    assert.equal(plan.status, "review-ready");
    assert.equal(plan.fingerprint, "reader-entry:declarative-reader-mapping-drift");
    assert.equal(plan.whitelistRuleId, "reader-entry-declarative-mapping");
  });

  it("should normalize legacy reader-event listener alias to canonical fingerprint in patch plan output", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "reader-event:listener-registration-mismatch",
        feature: "reader-event",
        featureLabel: "Reader 事件桥",
        candidateFiles: [
          "src/features/reader.js",
        ],
      },
    });

    assert.equal(plan.status, "review-ready");
    assert.equal(plan.fingerprint, "reader-event:toolbar-bridge-registration-drift");
    assert.equal(plan.whitelistRuleId, "reader-event-toolbar-bridge-registration");
  });

  it("should normalize legacy reader-event synthetic-fallback alias to canonical fingerprint in patch plan output", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "reader-event:synthetic-fallback-mapping-missing",
        feature: "reader-event",
        featureLabel: "Reader 事件桥",
        candidateFiles: [
          "src/features/reader.js",
        ],
      },
    });

    assert.equal(plan.status, "review-ready");
    assert.equal(plan.fingerprint, "reader-event:fine-grained-hook-declaration-drift");
    assert.equal(plan.whitelistRuleId, "reader-event-fine-grained-hook-declarations");
  });

  it("should normalize legacy reader-event probe-compatible alias to canonical fingerprint in patch plan output", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "reader-event:probe-compatible-type-missing",
        feature: "reader-event",
        featureLabel: "Reader 事件桥",
        candidateFiles: [
          "src/features/reader.js",
        ],
      },
    });

    assert.equal(plan.status, "review-ready");
    assert.equal(plan.fingerprint, "reader-event:fine-grained-hook-declaration-drift");
    assert.equal(plan.whitelistRuleId, "reader-event-fine-grained-hook-declarations");
  });

  it("should derive a review-ready patch plan for missing reader summary menu registration", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "reader-entry:reader-summary-menu-missing",
        feature: "reader-entry",
        featureLabel: "Reader 命令与菜单入口",
        candidateFiles: [
          "src/app/feature-composer.js",
        ],
      },
    });

    assert.equal(plan.status, "review-ready");
    assert.equal(plan.whitelisted, true);
    assert.equal(plan.whitelistRuleId, "reader-entry-declarative-mapping");
    assert.ok(plan.allowedTargets.includes("src/app/feature-composer.js"));
    assert.equal(plan.patchDrafts[0].operation, "insert");
    assert.equal(plan.verificationContract.checks[0].kind, "all-cycle-check");
    assert.ok(String(plan.patchDrafts[0].patch).includes("registerReaderMenuItem"));
    assert.equal(plan.verificationContract.checks.some((check) => check.id === "reader-summary-menu-registered"), true);
  });

  it("should derive a review-ready patch plan for reader event bridge registration drift", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "reader-event:listener-registration-mismatch",
        feature: "reader-event",
        featureLabel: "Reader 事件桥",
        candidateFiles: [
          "src/features/reader.js",
        ],
      },
    });

    assert.equal(plan.status, "review-ready");
    assert.equal(plan.whitelisted, true);
    assert.equal(plan.whitelistRuleId, "reader-event-toolbar-bridge-registration");
    assert.ok(plan.allowedTargets.includes("src/features/reader.js"));
    assert.equal(plan.patchDrafts.length, 1);
    assert.equal(plan.patchDrafts[0].operation, "replace-block");
    assert.ok(String(plan.patchDrafts[0].patch).includes("registerEventListener"));
    assert.equal(plan.verificationContract.checks.some((check) => check.id === "reader-event-hook-scenario-passed"), true);
  });

  it("should derive a review-ready patch plan for reader event synthetic fallback drift", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "reader-event:synthetic-fallback-mapping-missing",
        feature: "reader-event",
        featureLabel: "Reader 事件桥",
        candidateFiles: [
          "src/features/reader.js",
        ],
      },
    });

    assert.equal(plan.status, "review-ready");
    assert.equal(plan.whitelisted, true);
    assert.equal(plan.whitelistRuleId, "reader-event-fine-grained-hook-declarations");
    assert.ok(plan.allowedTargets.includes("src/features/reader.js"));
    assert.equal(plan.patchDrafts.length, 1);
    assert.equal(plan.patchDrafts[0].operation, "replace-block");
    assert.ok(String(plan.patchDrafts[0].patch).includes("READER_EVENT_SYNTHETIC_FALLBACK_TYPES"));
    assert.equal(plan.verificationContract.checks.some((check) => check.id === "reader-event-synthetic-fallback-available"), true);
  });

  it("should derive a review-ready patch plan for reader event declaration drift", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "reader-event:probe-compatible-type-missing",
        feature: "reader-event",
        featureLabel: "Reader 事件桥",
        candidateFiles: [
          "src/features/reader.js",
        ],
      },
    });

    assert.equal(plan.status, "review-ready");
    assert.equal(plan.whitelisted, true);
    assert.equal(plan.whitelistRuleId, "reader-event-fine-grained-hook-declarations");
    assert.ok(plan.allowedTargets.includes("src/features/reader.js"));
    assert.equal(plan.patchDrafts.length, 2);
    assert.equal(plan.patchDrafts.every((draft) => draft.operation === "replace-block"), true);
    assert.equal(plan.verificationContract.checks.some((check) => check.id === "reader-event-known-type-count"), true);
    assert.equal(plan.verificationContract.checks.some((check) => check.id === "reader-event-probe-type-count"), true);
  });

  it("should derive a review-ready patch plan for missing primary action command registration", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "menu-action:primary-command-missing",
        feature: "menu-action",
        featureLabel: "主命令与菜单动作",
        candidateFiles: [
          "src/app/feature-composer.js",
        ],
      },
    });

    assert.equal(plan.status, "review-ready");
    assert.equal(plan.whitelisted, true);
    assert.equal(plan.whitelistRuleId, "menu-primary-command-registration");
    assert.ok(plan.allowedTargets.includes("src/app/feature-composer.js"));
    assert.equal(plan.patchDrafts[0].operation, "insert");
    assert.ok(String(plan.patchDrafts[0].patch).includes("primary-action"));
    assert.equal(plan.verificationContract.checks[0].id, "primary-action-command-registered");
  });

  it("should derive a review-ready patch plan for missing context menu registration", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "menu-action:context-menu-missing",
        feature: "menu-action",
        featureLabel: "主命令与菜单动作",
        candidateFiles: [
          "src/app/feature-composer.js",
        ],
      },
    });

    assert.equal(plan.status, "review-ready");
    assert.equal(plan.whitelisted, true);
    assert.equal(plan.whitelistRuleId, "menu-context-item-registration");
    assert.ok(plan.allowedTargets.includes("src/app/feature-composer.js"));
    assert.equal(plan.patchDrafts[0].operation, "insert");
    assert.ok(String(plan.patchDrafts[0].patch).includes("context-action"));
    assert.equal(plan.verificationContract.checks.some((check) => check.id === "context-action-menu-registered"), true);
  });

  it("should derive a review-ready patch plan for missing preference pane registration", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "preferences:preference-pane-missing",
        feature: "preferences",
        featureLabel: "偏好设置面板",
        candidateFiles: [
          "src/app/feature-composer.js",
        ],
      },
    });

    assert.equal(plan.status, "review-ready");
    assert.equal(plan.whitelisted, true);
    assert.equal(plan.whitelistRuleId, "preferences-pane-registration");
    assert.ok(plan.allowedTargets.includes("src/app/feature-composer.js"));
    assert.equal(plan.patchDrafts[0].operation, "insert");
    assert.ok(String(plan.patchDrafts[0].patch).includes("preferences"));
    assert.equal(plan.verificationContract.checks[0].id, "preference-pane-registered");
  });

  it("should derive a create patch plan for missing preference pane resource file", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "preferences:preference-pane-resource-missing",
        feature: "preferences",
        featureLabel: "偏好设置面板",
        candidateFiles: [
          "addon-static/content/preferences.xhtml",
        ],
      },
    });

    assert.equal(plan.status, "review-ready");
    assert.equal(plan.whitelisted, true);
    assert.equal(plan.whitelistRuleId, "preferences-pane-resource-file");
    assert.ok(plan.allowedTargets.includes("addon-static/content/preferences.xhtml"));
    assert.equal(plan.patchDrafts[0].operation, "create");
    assert.equal(plan.patchDrafts[0].file, "addon-static/content/preferences.xhtml");
    assert.ok(String(plan.patchDrafts[0].snippet).includes("cleanroom-preferences"));
    assert.equal(plan.verificationContract.checks[0].id, "preference-pane-registered");
    assert.equal(plan.verificationContract.checks.some((check) => check.id === "static-runtime-missing-count"), true);
  });

  it("should derive a create patch plan for missing runtime style resource file", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "runtime-logs:style-sheet-resource-missing",
        feature: "runtime-logs",
        featureLabel: "运行时日志与资源加载",
        candidateFiles: [
          "addon-static/content/style/main.css",
        ],
      },
    });

    assert.equal(plan.status, "review-ready");
    assert.equal(plan.whitelisted, true);
    assert.equal(plan.whitelistRuleId, "runtime-style-sheet-resource-file");
    assert.ok(plan.allowedTargets.includes("addon-static/content/style/main.css"));
    assert.equal(plan.patchDrafts[0].operation, "create");
    assert.equal(plan.patchDrafts[0].file, "addon-static/content/style/main.css");
    assert.ok(String(plan.patchDrafts[0].snippet).includes("#cleanroom-template-menuitem"));
    assert.equal(plan.verificationContract.checks[0].id, "error-log-count");
    assert.equal(plan.verificationContract.checks.some((check) => check.id === "static-runtime-missing-count"), true);
  });

  it("should reject non-whitelisted diagnoses", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "bootstrap:plugin-not-mounted",
        feature: "bootstrap",
        featureLabel: "启动与挂载",
        candidateFiles: [
          "src/app/plugin.js",
        ],
      },
    });

    assert.equal(plan.status, "no-whitelist-match");
    assert.equal(plan.whitelisted, false);
    assert.ok(String(plan.rationale).includes("还不在当前受限补丁白名单内"));
  });

  it("should apply a visual baseline copy draft when source matches latest e2e report", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-visual-copy-"));
    const sourceFile = path.join(tempRoot, "dist", "agent-zotero-e2e-assets", "cycle-2-reader.png");
    const reportFile = path.join(tempRoot, "dist", "agent-zotero-e2e.json");
    const targetFile = path.join(tempRoot, "tests", "visual-baselines", "agent-zotero-e2e", "hot-reload-reader.png");
    fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(sourceFile, Buffer.from("reader-visual-source"));
    fs.writeFileSync(targetFile, Buffer.from("old-reader-baseline"));
    const sourceHash = crypto.createHash("sha256").update(fs.readFileSync(sourceFile)).digest("hex");

    const report = {
      projectRoot: tempRoot,
      passed: false,
      primaryDiagnosis: {
        fingerprint: "reader-ui:reader-visual-drift",
        feature: "reader-ui",
        featureLabel: "Reader 与视觉回归",
        candidateFiles: [
          "tests/visual-baselines/agent-zotero-e2e/hot-reload-reader.png",
        ],
      },
      cycles: [{
        index: 2,
        bootMode: "hot-reload",
        visuals: {
          captures: [{
            kind: "reader",
            path: sourceFile,
            analysis: {
              sha256: sourceHash,
            },
          }],
          analysis: {
            baselines: [{
              kind: "reader",
              bootMode: "hot-reload",
              path: targetFile,
              status: "compared",
              ok: false,
            }],
          },
        },
      }],
    };
    fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf-8");

    const plan = derivePatchPlan(report);
    const result = await applyPatchPlan(tempRoot, plan);

    assert.equal(result.attempted, true);
    assert.equal(result.ok, true);
    assert.equal(result.status, "applied");
    assert.ok(result.appliedFiles.includes("tests/visual-baselines/agent-zotero-e2e/hot-reload-reader.png"));
    assert.deepEqual(fs.readFileSync(targetFile), fs.readFileSync(sourceFile));
  });

  it("should refuse visual baseline copy when source hash drifts from latest e2e evidence", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-visual-hash-"));
    const sourceFile = path.join(tempRoot, "dist", "agent-zotero-e2e-assets", "cycle-2-reader.png");
    const reportFile = path.join(tempRoot, "dist", "agent-zotero-e2e.json");
    const targetFile = path.join(tempRoot, "tests", "visual-baselines", "agent-zotero-e2e", "hot-reload-reader.png");
    fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(sourceFile, Buffer.from("reader-visual-source"));
    fs.writeFileSync(targetFile, Buffer.from("old-reader-baseline"));
    const sourceHash = crypto.createHash("sha256").update(fs.readFileSync(sourceFile)).digest("hex");

    const report = {
      projectRoot: tempRoot,
      passed: false,
      primaryDiagnosis: {
        fingerprint: "reader-ui:reader-visual-drift",
        feature: "reader-ui",
        featureLabel: "Reader 与视觉回归",
        candidateFiles: [
          "tests/visual-baselines/agent-zotero-e2e/hot-reload-reader.png",
        ],
      },
      cycles: [{
        index: 2,
        bootMode: "hot-reload",
        visuals: {
          captures: [{
            kind: "reader",
            path: sourceFile,
            analysis: {
              sha256: sourceHash,
            },
          }],
          analysis: {
            baselines: [{
              kind: "reader",
              bootMode: "hot-reload",
              path: targetFile,
              status: "compared",
              ok: false,
            }],
          },
        },
      }],
    };
    fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf-8");

    const plan = derivePatchPlan(report);
    fs.writeFileSync(sourceFile, Buffer.from("reader-visual-source-mutated"));
    const result = await applyPatchPlan(tempRoot, plan);

    assert.equal(result.attempted, true);
    assert.equal(result.ok, false);
    assert.equal(result.status, "precheck-failed");
    assert.equal(result.results[0].reason, "source-hash-mismatch");
  });

  it("should refuse visual baseline copy when source evidence is redirected to a different baseline target", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-visual-target-mismatch-"));
    const sourceFile = path.join(tempRoot, "dist", "agent-zotero-e2e-assets", "cycle-2-reader.png");
    const reportFile = path.join(tempRoot, "dist", "agent-zotero-e2e.json");
    const targetFile = path.join(tempRoot, "tests", "visual-baselines", "agent-zotero-e2e", "hot-reload-reader.png");
    fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(sourceFile, Buffer.from("reader-visual-source"));
    fs.writeFileSync(targetFile, Buffer.from("old-reader-baseline"));
    const sourceHash = crypto.createHash("sha256").update(fs.readFileSync(sourceFile)).digest("hex");

    const report = {
      projectRoot: tempRoot,
      passed: false,
      primaryDiagnosis: {
        fingerprint: "reader-ui:reader-visual-drift",
        feature: "reader-ui",
        featureLabel: "Reader 与视觉回归",
        candidateFiles: [
          "tests/visual-baselines/agent-zotero-e2e/hot-reload-reader.png",
        ],
      },
      cycles: [{
        index: 2,
        bootMode: "hot-reload",
        visuals: {
          captures: [{
            kind: "reader",
            path: sourceFile,
            analysis: {
              sha256: sourceHash,
            },
          }],
          analysis: {
            baselines: [{
              kind: "reader",
              bootMode: "hot-reload",
              path: targetFile,
              status: "compared",
              ok: false,
            }],
          },
        },
      }],
    };
    fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf-8");

    const plan = derivePatchPlan(report);
    plan.patchDrafts[0].file = "tests/visual-baselines/agent-zotero-e2e/hot-reload-library.png";
    const result = await applyPatchPlan(tempRoot, plan);

    assert.equal(result.attempted, true);
    assert.equal(result.ok, false);
    assert.equal(result.status, "precheck-failed");
    assert.equal(result.results[0].reason, "visual-target-mismatch");
  });

  it("should refuse visual baseline copy when patch draft set no longer matches latest e2e drift set", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-visual-draft-set-mismatch-"));
    const readerSourceFile = path.join(tempRoot, "dist", "agent-zotero-e2e-assets", "cycle-2-reader.png");
    const librarySourceFile = path.join(tempRoot, "dist", "agent-zotero-e2e-assets", "cycle-2-library.png");
    const reportFile = path.join(tempRoot, "dist", "agent-zotero-e2e.json");
    const readerTargetFile = path.join(tempRoot, "tests", "visual-baselines", "agent-zotero-e2e", "hot-reload-reader.png");
    const libraryTargetFile = path.join(tempRoot, "tests", "visual-baselines", "agent-zotero-e2e", "hot-reload-library.png");
    fs.mkdirSync(path.dirname(readerSourceFile), { recursive: true });
    fs.mkdirSync(path.dirname(readerTargetFile), { recursive: true });
    fs.writeFileSync(readerSourceFile, Buffer.from("reader-visual-source"));
    fs.writeFileSync(librarySourceFile, Buffer.from("library-visual-source"));
    fs.writeFileSync(readerTargetFile, Buffer.from("old-reader-baseline"));
    fs.writeFileSync(libraryTargetFile, Buffer.from("old-library-baseline"));
    const readerSourceHash = crypto.createHash("sha256").update(fs.readFileSync(readerSourceFile)).digest("hex");
    const librarySourceHash = crypto.createHash("sha256").update(fs.readFileSync(librarySourceFile)).digest("hex");

    const report = {
      projectRoot: tempRoot,
      passed: false,
      primaryDiagnosis: {
        fingerprint: "reader-ui:reader-visual-drift",
        feature: "reader-ui",
        featureLabel: "Reader 与视觉回归",
        candidateFiles: [
          "tests/visual-baselines/agent-zotero-e2e/hot-reload-reader.png",
          "tests/visual-baselines/agent-zotero-e2e/hot-reload-library.png",
        ],
      },
      cycles: [{
        index: 2,
        bootMode: "hot-reload",
        visuals: {
          captures: [{
            kind: "reader",
            path: readerSourceFile,
            analysis: {
              sha256: readerSourceHash,
            },
          }, {
            kind: "library",
            path: librarySourceFile,
            analysis: {
              sha256: librarySourceHash,
            },
          }],
          analysis: {
            baselines: [{
              kind: "reader",
              bootMode: "hot-reload",
              path: readerTargetFile,
              status: "compared",
              ok: false,
            }, {
              kind: "library",
              bootMode: "hot-reload",
              path: libraryTargetFile,
              status: "compared",
              ok: false,
            }],
          },
        },
      }],
    };
    fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf-8");

    const plan = derivePatchPlan(report);
    plan.patchDrafts.pop();
    const result = await applyPatchPlan(tempRoot, plan);

    assert.equal(result.attempted, true);
    assert.equal(result.ok, false);
    assert.equal(result.status, "precheck-failed");
    assert.equal(result.results[0].reason, "visual-draft-set-mismatch");
  });

  it("should reject patch drafts that target files outside whitelist", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-patch-sandbox-target-"));
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "config:default-enabled-disabled",
        feature: "config",
        featureLabel: "默认配置修正",
        candidateFiles: [
          "config/addon.config.json",
        ],
      },
    });
    plan.patchDrafts[0].file = "README.md";

    const result = await applyPatchPlan(tempRoot, plan);

    assert.equal(result.attempted, true);
    assert.equal(result.ok, false);
    assert.equal(result.status, "precheck-failed");
    assert.equal(result.results[0].reason, "target-outside-whitelist");
    assert.equal(result.results[0].file, "README.md");
  });

  it("should reject reader event patch drafts when touched files exceed rule limit", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-reader-event-touched-limit-"));
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "reader-event:synthetic-fallback-mapping-missing",
        feature: "reader-event",
        featureLabel: "Reader 事件桥",
        candidateFiles: [
          "src/features/reader.js",
        ],
      },
    });
    plan.patchDrafts.push({
      ...plan.patchDrafts[0],
      file: "src/app/plugin-agent.js",
    });

    const result = await applyPatchPlan(tempRoot, plan);

    assert.equal(result.attempted, true);
    assert.equal(result.ok, false);
    assert.equal(result.status, "precheck-failed");
    assert.equal(result.results[0].reason, "touched-files-limit-exceeded");
  });

  it("should reject patch plans when whitelist rule id and fingerprint point to different rules", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-patch-sandbox-rule-mismatch-"));
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "config:default-enabled-disabled",
        feature: "config",
        featureLabel: "默认配置修正",
        candidateFiles: [
          "config/addon.config.json",
        ],
      },
    });
    plan.fingerprint = "preferences:preference-pane-resource-missing";

    const result = await applyPatchPlan(tempRoot, plan);

    assert.equal(result.attempted, true);
    assert.equal(result.ok, false);
    assert.equal(result.status, "precheck-failed");
    assert.equal(result.results[0].reason, "whitelist-rule-mismatch");
    assert.equal(result.results[0].file, null);
  });

  it("should reject patch drafts when draft content mismatches canonical whitelist draft", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-patch-sandbox-draft-"));
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "localization:item-pane-section-header-ftl-key-missing",
        feature: "localization",
        featureLabel: "本地化引用修正",
        issue: "Locale zh-CN 缺少 FTL key cleanroom-item-pane-section-header。",
        candidateFiles: [
          "addon-static/locale/zh-CN/main.ftl",
        ],
      },
    });
    plan.patchDrafts[0].snippet = "cleanroom-item-pane-section-header =\n    .label = 被篡改\n";
    plan.patchDrafts[0].patch = "@@ zh-CN/main.ftl\n+cleanroom-item-pane-section-header =\n+    .label = 被篡改";

    const result = await applyPatchPlan(tempRoot, plan);

    assert.equal(result.attempted, true);
    assert.equal(result.ok, false);
    assert.equal(result.status, "precheck-failed");
    assert.equal(result.results[0].reason, "draft-mismatch");
    assert.equal(result.results[0].file, "addon-static/locale/zh-CN/main.ftl");
  });

  it("should apply a whitelisted patch draft into target file when anchor exists", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-patch-"));
    const targetDir = path.join(tempRoot, "src", "app");
    fs.mkdirSync(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, "feature-composer.js");
    fs.writeFileSync(targetFile, `export function createFeatureComposer() {
  async function registerBaselineFeatures() {
    itemTree.registerColumn({
      dataKey: demoColumnKey,
    });
    itemPane.registerInfoRow({
      rowID: demoInfoRowID,
    });
    notifier.subscribe(
      ["item", "file", "tab"],
      () => {},
      {
        id: demoNotifierID,
      },
    );
    logger.info("plugin.baseline.ready", {});
  }

  return {
    registerBaselineFeatures,
  };
}
`, "utf-8");

    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "item-pane:item-pane-section-missing",
        feature: "item-pane",
        featureLabel: "ItemPane 注册",
        candidateFiles: ["src/app/feature-composer.js"],
      },
    });

    const result = await applyPatchPlan(tempRoot, plan);
    const updated = fs.readFileSync(targetFile, "utf-8");

    assert.equal(result.attempted, true);
    assert.equal(result.ok, true);
    assert.ok(result.appliedFiles.includes("src/app/feature-composer.js"));
    assert.ok(updated.includes("itemPane.registerSection({"));
    assert.ok(updated.includes("paneID: demoSectionID"));
  });

  it("should apply a reader command registration patch when the command block is missing", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-reader-command-"));
    const targetDir = path.join(tempRoot, "src", "app");
    fs.mkdirSync(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, "feature-composer.js");
    fs.writeFileSync(targetFile, `export function createFeatureComposer({
  config,
  i18n,
  commandPalette,
  menuManager,
  prefs,
  reader,
  runPrimaryAction,
  runReaderDemo,
}) {
  async function registerBaselineFeatures() {
    commandPalette.registerCommand({
      id: \`${"${"}config.addonRef}-primary-action\`,
      label: i18n.t("cleanroom-command-label", "Open Cleanroom Action"),
      category: config.addonName,
      description: i18n.t(
        "cleanroom-command-description",
        "Run the default clean-room template action.",
      ),
      condition: () => Boolean(prefs.get("enabled")),
      handler: () => {
        runPrimaryAction();
      },
    });

    if (menuManager.isOfficialAPIAvailable()) {
      menuManager.registerContextMenuItem({
        id: \`${"${"}config.addonRef}-context-action\`,
      });
    }

    itemTree.registerColumn({
      dataKey: demoColumnKey,
    });
  }
}
`, "utf-8");

    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "reader-entry:reader-summary-command-missing",
        feature: "reader-entry",
        featureLabel: "Reader 命令与菜单入口",
        candidateFiles: ["src/app/feature-composer.js"],
      },
    });

    const result = await applyPatchPlan(tempRoot, plan);
    const updated = fs.readFileSync(targetFile, "utf-8");

    assert.equal(result.attempted, true);
    assert.equal(result.ok, true);
    assert.equal(result.status, "applied");
    assert.ok(updated.includes('id: `${config.addonRef}-reader-summary`,'));
    assert.ok(updated.includes('condition: () => Boolean(reader.getActiveSummary())'));
  });

  it("should apply a reader event bridge registration patch when the bridge function drifts", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-reader-event-bridge-"));
    const targetDir = path.join(tempRoot, "src", "features");
    fs.mkdirSync(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, "reader.js");
    const baselineSource = fs.readFileSync(path.resolve("src/features/reader.js"), "utf-8");
    const driftedSource = baselineSource.replace(
      "    Zotero.Reader.registerEventListener(eventType, wrappedHandler, effectivePluginID);\n",
      "",
    );
    fs.writeFileSync(targetFile, driftedSource, "utf-8");

    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "reader-event:listener-registration-mismatch",
        feature: "reader-event",
        featureLabel: "Reader 事件桥",
        candidateFiles: ["src/features/reader.js"],
      },
    });

    const result = await applyPatchPlan(tempRoot, plan);
    const updated = fs.readFileSync(targetFile, "utf-8");

    assert.equal(result.attempted, true);
    assert.equal(result.ok, true);
    assert.equal(result.status, "applied");
    assert.ok(updated.includes("Zotero.Reader.registerEventListener(eventType, wrappedHandler, effectivePluginID);"));
    assert.ok(updated.includes("registeredEventListeners.push({"));
  });

  it("should apply a reader menu registration patch when the menu block is missing", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-reader-menu-"));
    const targetDir = path.join(tempRoot, "src", "app");
    fs.mkdirSync(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, "feature-composer.js");
    fs.writeFileSync(targetFile, `export function createFeatureComposer({
  config,
  i18n,
  commandPalette,
  menuManager,
  prefs,
  reader,
  runPrimaryAction,
  runReaderDemo,
  itemTree,
}) {
  async function registerBaselineFeatures() {
    commandPalette.registerCommand({
      id: \`${"${"}config.addonRef}-primary-action\`,
      label: i18n.t("cleanroom-command-label", "Open Cleanroom Action"),
      category: config.addonName,
      description: i18n.t(
        "cleanroom-command-description",
        "Run the default clean-room template action.",
      ),
      condition: () => Boolean(prefs.get("enabled")),
      handler: () => {
        runPrimaryAction();
      },
    });

    commandPalette.registerCommand({
      id: \`${"${"}config.addonRef}-reader-summary\`,
      label: i18n.t(
        "cleanroom-reader-menu-label",
        "Show Reader Demo Summary",
      ),
      category: config.addonName,
      description: i18n.t(
        "cleanroom-reader-command-description",
        "Show the active reader summary.",
      ),
      condition: () => Boolean(reader.getActiveSummary()),
      handler: () => {
        runReaderDemo();
      },
    });

    if (menuManager.isOfficialAPIAvailable()) {
      menuManager.registerContextMenuItem({
        id: \`${"${"}config.addonRef}-context-action\`,
        l10nID: "cleanroom-menu-label",
      });
    }

    itemTree.registerColumn({
      dataKey: demoColumnKey,
    });
  }
}
`, "utf-8");

    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "reader-entry:reader-summary-menu-missing",
        feature: "reader-entry",
        featureLabel: "Reader 命令与菜单入口",
        candidateFiles: ["src/app/feature-composer.js"],
      },
    });

    const result = await applyPatchPlan(tempRoot, plan);
    const updated = fs.readFileSync(targetFile, "utf-8");

    assert.equal(result.attempted, true);
    assert.equal(result.ok, true);
    assert.equal(result.status, "applied");
    assert.ok(updated.includes("menuManager.registerReaderMenuItem("));
    assert.ok(updated.includes("menuManager.MENU_TARGETS.READER_MENU_VIEW"));
  });

  it("should apply a reader event synthetic fallback patch when fallback declarations drift", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-reader-event-fallback-"));
    const targetDir = path.join(tempRoot, "src", "features");
    fs.mkdirSync(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, "reader.js");
    const baselineSource = fs.readFileSync(path.resolve("src/features/reader.js"), "utf-8");
    const blockStart = baselineSource.indexOf("export const READER_EVENT_SYNTHETIC_FALLBACK_TYPES = Object.freeze([");
    const blockEnd = baselineSource.indexOf("]);", blockStart);
    const fallbackBlock = baselineSource.slice(blockStart, blockEnd + 3);
    const driftedFallbackBlock = fallbackBlock.replace(
      "  READER_EVENT_TYPES.CREATE_SELECTOR_CONTEXT_MENU,\n",
      "",
    );
    const driftedSource = `${baselineSource.slice(0, blockStart)}${driftedFallbackBlock}${baselineSource.slice(blockEnd + 3)}`;
    fs.writeFileSync(targetFile, driftedSource, "utf-8");

    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "reader-event:synthetic-fallback-mapping-missing",
        feature: "reader-event",
        featureLabel: "Reader 事件桥",
        candidateFiles: ["src/features/reader.js"],
      },
    });

    const result = await applyPatchPlan(tempRoot, plan);
    const updated = fs.readFileSync(targetFile, "utf-8");

    assert.equal(result.attempted, true);
    assert.equal(result.ok, true);
    assert.equal(result.status, "applied");
    assert.ok(updated.includes("export const READER_EVENT_SYNTHETIC_FALLBACK_TYPES = Object.freeze(["));
    assert.ok(updated.includes("READER_EVENT_TYPES.CREATE_SELECTOR_CONTEXT_MENU"));
  });

  it("should apply a primary action command patch when the command block is missing", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-primary-command-"));
    const targetDir = path.join(tempRoot, "src", "app");
    fs.mkdirSync(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, "feature-composer.js");
    fs.writeFileSync(targetFile, `export function createFeatureComposer({
  config,
  i18n,
  preferencePanes,
  commandPalette,
  menuManager,
  prefs,
  reader,
  itemTree,
  runPrimaryAction,
  runReaderDemo,
}) {
  async function registerBaselineFeatures() {
    await preferencePanes.registerPane({
      id: \`${"${"}config.addonRef}-preferences\`,
      src: "content/preferences.xhtml",
      label: config.addonName,
      image: config.icons?.["48"] || config.icons?.["96"],
    });

    commandPalette.registerCommand({
      id: \`${"${"}config.addonRef}-reader-summary\`,
      label: i18n.t(
        "cleanroom-reader-menu-label",
        "Show Reader Demo Summary",
      ),
      category: config.addonName,
      description: i18n.t(
        "cleanroom-reader-command-description",
        "Show the active reader summary.",
      ),
      condition: () => Boolean(reader.getActiveSummary()),
      handler: () => {
        runReaderDemo();
      },
    });

    if (menuManager.isOfficialAPIAvailable()) {
      menuManager.registerContextMenuItem({
        id: \`${"${"}config.addonRef}-context-action\`,
      });
      menuManager.registerReaderMenuItem(
        {
          target: menuManager.MENU_TARGETS.READER_MENU_VIEW,
        },
        {
          id: \`${"${"}config.addonRef}-reader-summary\`,
          l10nID: "cleanroom-reader-menu-label",
        },
      );
    }

    itemTree.registerColumn({
      dataKey: demoColumnKey,
    });
  }
}
`, "utf-8");

    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "menu-action:primary-command-missing",
        feature: "menu-action",
        featureLabel: "主命令与菜单动作",
        candidateFiles: ["src/app/feature-composer.js"],
      },
    });

    const result = await applyPatchPlan(tempRoot, plan);
    const updated = fs.readFileSync(targetFile, "utf-8");

    assert.equal(result.attempted, true);
    assert.equal(result.ok, true);
    assert.equal(result.status, "applied");
    assert.ok(updated.includes('id: `${config.addonRef}-primary-action`,'));
    assert.ok(updated.includes("runPrimaryAction();"));
  });

  it("should apply a context menu patch when the menu item block is missing", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-context-menu-"));
    const targetDir = path.join(tempRoot, "src", "app");
    fs.mkdirSync(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, "feature-composer.js");
    fs.writeFileSync(targetFile, `export function createFeatureComposer({
  config,
  i18n,
  preferencePanes,
  commandPalette,
  menuManager,
  prefs,
  reader,
  itemTree,
  getPrimaryWindow,
  runPrimaryAction,
  runReaderDemo,
}) {
  async function registerBaselineFeatures() {
    await preferencePanes.registerPane({
      id: \`${"${"}config.addonRef}-preferences\`,
      src: "content/preferences.xhtml",
      label: config.addonName,
      image: config.icons?.["48"] || config.icons?.["96"],
    });

    commandPalette.registerCommand({
      id: \`${"${"}config.addonRef}-primary-action\`,
      label: i18n.t("cleanroom-command-label", "Open Cleanroom Action"),
      category: config.addonName,
      description: i18n.t(
        "cleanroom-command-description",
        "Run the default clean-room template action.",
      ),
      condition: () => Boolean(prefs.get("enabled")),
      handler: () => {
        runPrimaryAction();
      },
    });

    commandPalette.registerCommand({
      id: \`${"${"}config.addonRef}-reader-summary\`,
      label: i18n.t(
        "cleanroom-reader-menu-label",
        "Show Reader Demo Summary",
      ),
      category: config.addonName,
      description: i18n.t(
        "cleanroom-reader-command-description",
        "Show the active reader summary.",
      ),
      condition: () => Boolean(reader.getActiveSummary()),
      handler: () => {
        runReaderDemo();
      },
    });

    if (menuManager.isOfficialAPIAvailable()) {
      menuManager.registerReaderMenuItem(
        {
          target: menuManager.MENU_TARGETS.READER_MENU_VIEW,
        },
        {
          id: \`${"${"}config.addonRef}-reader-summary\`,
          l10nID: "cleanroom-reader-menu-label",
        },
      );
    }

    itemTree.registerColumn({
      dataKey: demoColumnKey,
    });
  }
}
`, "utf-8");

    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "menu-action:context-menu-missing",
        feature: "menu-action",
        featureLabel: "主命令与菜单动作",
        candidateFiles: ["src/app/feature-composer.js"],
      },
    });

    const result = await applyPatchPlan(tempRoot, plan);
    const updated = fs.readFileSync(targetFile, "utf-8");

    assert.equal(result.attempted, true);
    assert.equal(result.ok, true);
    assert.equal(result.status, "applied");
    assert.ok(updated.includes("menuManager.registerContextMenuItem("));
    assert.ok(updated.includes('id: `${config.addonRef}-context-action`,'));
  });

  it("should apply a preference pane patch when the pane registration block is missing", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-preference-pane-"));
    const targetDir = path.join(tempRoot, "src", "app");
    fs.mkdirSync(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, "feature-composer.js");
    fs.writeFileSync(targetFile, `export function createFeatureComposer({
  config,
  i18n,
  commandPalette,
  menuManager,
  prefs,
  reader,
  itemTree,
  runPrimaryAction,
  runReaderDemo,
}) {
  let baselineReady = false;

  async function registerBaselineFeatures() {
    if (baselineReady) {
      return;
    }
    baselineReady = true;

    commandPalette.registerCommand({
      id: \`${"${"}config.addonRef}-primary-action\`,
      label: i18n.t("cleanroom-command-label", "Open Cleanroom Action"),
      category: config.addonName,
      description: i18n.t(
        "cleanroom-command-description",
        "Run the default clean-room template action.",
      ),
      condition: () => Boolean(prefs.get("enabled")),
      handler: () => {
        runPrimaryAction();
      },
    });

    commandPalette.registerCommand({
      id: \`${"${"}config.addonRef}-reader-summary\`,
      label: i18n.t(
        "cleanroom-reader-menu-label",
        "Show Reader Demo Summary",
      ),
      category: config.addonName,
      description: i18n.t(
        "cleanroom-reader-command-description",
        "Show the active reader summary.",
      ),
      condition: () => Boolean(reader.getActiveSummary()),
      handler: () => {
        runReaderDemo();
      },
    });

    if (menuManager.isOfficialAPIAvailable()) {
      menuManager.registerContextMenuItem({
        id: \`${"${"}config.addonRef}-context-action\`,
        l10nID: "cleanroom-menu-label",
      });
      menuManager.registerReaderMenuItem(
        {
          target: menuManager.MENU_TARGETS.READER_MENU_VIEW,
        },
        {
          id: \`${"${"}config.addonRef}-reader-summary\`,
          l10nID: "cleanroom-reader-menu-label",
        },
      );
    }

    itemTree.registerColumn({
      dataKey: demoColumnKey,
    });
  }
}
`, "utf-8");

    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "preferences:preference-pane-missing",
        feature: "preferences",
        featureLabel: "偏好设置面板",
        candidateFiles: ["src/app/feature-composer.js"],
      },
    });

    const result = await applyPatchPlan(tempRoot, plan);
    const updated = fs.readFileSync(targetFile, "utf-8");

    assert.equal(result.attempted, true);
    assert.equal(result.ok, true);
    assert.equal(result.status, "applied");
    assert.ok(updated.includes("preferencePanes.registerPane({"));
    assert.ok(updated.includes('src: "content/preferences.xhtml",'));
  });

  it("should create a missing preference pane resource file from clean-room baseline", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-preference-resource-"));
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "preferences:preference-pane-resource-missing",
        feature: "preferences",
        featureLabel: "偏好设置面板",
        candidateFiles: ["addon-static/content/preferences.xhtml"],
      },
    });

    const result = await applyPatchPlan(tempRoot, plan);
    const createdFile = path.join(tempRoot, "addon-static", "content", "preferences.xhtml");
    const created = fs.readFileSync(createdFile, "utf-8");

    assert.equal(result.attempted, true);
    assert.equal(result.ok, true);
    assert.equal(result.status, "applied");
    assert.ok(created.includes('id="cleanroom-preferences"'));
    assert.ok(created.includes('name="__PREFS_PREFIX__.enabled"'));
  });

  it("should create a missing bootstrap startup file from clean-room baseline", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-bootstrap-resource-"));
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "bootstrap:bootstrap-file-missing",
        feature: "bootstrap",
        featureLabel: "启动与挂载",
        candidateFiles: ["addon-static/bootstrap.js"],
      },
    });

    const result = await applyPatchPlan(tempRoot, plan);
    const createdFile = path.join(tempRoot, "addon-static", "bootstrap.js");
    const created = fs.readFileSync(createdFile, "utf-8");

    assert.equal(result.attempted, true);
    assert.equal(result.ok, true);
    assert.equal(result.status, "applied");
    assert.ok(created.includes("function _installCapabilityWhitelist(pluginScope, chromeGlobal)"));
    assert.ok(created.includes('addonRef: "__ADDON_REF__"'));
    assert.ok(created.includes('const instanceKey = "__INSTANCE_KEY__";'));
  });

  it("should copy a drifted bootstrap startup file back to the clean-room baseline", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-bootstrap-drift-"));
    const targetDir = path.join(tempRoot, "addon-static");
    const sourceDir = path.join(tempRoot, "scripts", "baselines");
    fs.mkdirSync(targetDir, { recursive: true });
    fs.mkdirSync(sourceDir, { recursive: true });
    const baselineSource = fs.readFileSync(path.resolve("scripts", "baselines", "bootstrap.js.txt"), "utf-8");
    fs.writeFileSync(path.join(sourceDir, "bootstrap.js.txt"), baselineSource, "utf-8");
    fs.writeFileSync(path.join(targetDir, "bootstrap.js"), "var driftedBootstrap = true;\n", "utf-8");

    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "bootstrap:bootstrap-file-drift",
        feature: "bootstrap",
        featureLabel: "启动与挂载",
        candidateFiles: ["addon-static/bootstrap.js"],
      },
    });

    const result = await applyPatchPlan(tempRoot, plan);
    const updated = fs.readFileSync(path.join(targetDir, "bootstrap.js"), "utf-8");

    assert.equal(result.attempted, true);
    assert.equal(result.ok, true);
    assert.equal(result.status, "applied");
    assert.equal(updated, baselineSource);
  });

  it("should treat an exact existing create target as already current", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-create-exact-existing-"));
    const targetDir = path.join(tempRoot, "addon-static", "content");
    fs.mkdirSync(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, "preferences.xhtml");
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "preferences:preference-pane-resource-missing",
        feature: "preferences",
        featureLabel: "偏好设置面板",
        candidateFiles: ["addon-static/content/preferences.xhtml"],
      },
    });

    fs.writeFileSync(targetFile, String(plan.patchDrafts[0].snippet || ""), "utf-8");
    const result = await applyPatchPlan(tempRoot, plan);

    assert.equal(result.attempted, true);
    assert.equal(result.ok, false);
    assert.equal(result.status, "precheck-failed");
    assert.equal(result.results[0].reason, "target-already-contains-snippet");
    assert.equal(result.results[0].snippetPresent, true);
  });

  it("should block create patch when existing file only contains the baseline as a fragment", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-create-fragment-existing-"));
    const targetDir = path.join(tempRoot, "addon-static", "content");
    fs.mkdirSync(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, "preferences.xhtml");
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "preferences:preference-pane-resource-missing",
        feature: "preferences",
        featureLabel: "偏好设置面板",
        candidateFiles: ["addon-static/content/preferences.xhtml"],
      },
    });

    fs.writeFileSync(
      targetFile,
      `<!-- customized wrapper -->\n${String(plan.patchDrafts[0].snippet || "")}\n<!-- customized footer -->\n`,
      "utf-8",
    );
    const result = await applyPatchPlan(tempRoot, plan);

    assert.equal(result.attempted, true);
    assert.equal(result.ok, false);
    assert.equal(result.status, "precheck-failed");
    assert.equal(result.results[0].reason, "target-file-exists");
    assert.equal(result.results[0].snippetPresent, false);
  });

  it("should copy a missing icon resource file from clean-room baseline", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-icon-resource-"));
    const baselineSource = fs.readFileSync(path.resolve("scripts", "baselines", "icons", "icon-48.png"));
    const baselineTarget = path.join(tempRoot, "scripts", "baselines", "icons");
    fs.mkdirSync(baselineTarget, { recursive: true });
    fs.writeFileSync(path.join(baselineTarget, "icon-48.png"), baselineSource);

    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "assets:icon-resource-missing",
        feature: "assets",
        featureLabel: "静态资源与图标",
        issue: "静态运行时基线缺失：addon-static/content/icons/icon-48.png（配置声明的 icon 资源）。",
        candidateFiles: ["addon-static/content/icons/icon-48.png"],
      },
    });

    const result = await applyPatchPlan(tempRoot, plan);
    const createdFile = path.join(tempRoot, "addon-static", "content", "icons", "icon-48.png");

    assert.equal(result.attempted, true);
    assert.equal(result.ok, true);
    assert.equal(result.status, "applied");
    assert.deepEqual(fs.readFileSync(createdFile), baselineSource);
  });

  it("should copy a drifted icon resource file back to the clean-room baseline", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-icon-resource-drift-"));
    const baselineSource = fs.readFileSync(path.resolve("scripts", "baselines", "icons", "icon-96.png"));
    const targetDir = path.join(tempRoot, "addon-static", "content", "icons");
    const sourceDir = path.join(tempRoot, "scripts", "baselines", "icons");
    fs.mkdirSync(targetDir, { recursive: true });
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, "icon-96.png"), baselineSource);
    fs.writeFileSync(path.join(targetDir, "icon-96.png"), Buffer.from("drifted-icon-content"));

    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "assets:icon-resource-drift",
        feature: "assets",
        featureLabel: "静态资源与图标",
        issue: "静态运行时基线漂移：addon-static/content/icons/icon-96.png（配置声明的 icon 资源）。",
        candidateFiles: ["addon-static/content/icons/icon-96.png"],
      },
    });

    const result = await applyPatchPlan(tempRoot, plan);
    const updated = fs.readFileSync(path.join(targetDir, "icon-96.png"));

    assert.equal(result.attempted, true);
    assert.equal(result.ok, true);
    assert.equal(result.status, "applied");
    assert.deepEqual(updated, baselineSource);
  });

  it("should create a missing runtime style resource file from clean-room baseline", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-style-resource-"));
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "runtime-logs:style-sheet-resource-missing",
        feature: "runtime-logs",
        featureLabel: "运行时日志与资源加载",
        candidateFiles: ["addon-static/content/style/main.css"],
      },
    });

    const result = await applyPatchPlan(tempRoot, plan);
    const createdFile = path.join(tempRoot, "addon-static", "content", "style", "main.css");
    const created = fs.readFileSync(createdFile, "utf-8");

    assert.equal(result.attempted, true);
    assert.equal(result.ok, true);
    assert.equal(result.status, "applied");
    assert.ok(created.includes("#cleanroom-template-menuitem"));
    assert.ok(created.includes("font-weight: 600;"));
  });

  it("should copy a drifted preference pane resource file back to the clean-room baseline", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-preference-resource-drift-"));
    const targetDir = path.join(tempRoot, "addon-static", "content");
    const sourceDir = path.join(tempRoot, "scripts", "baselines");
    fs.mkdirSync(targetDir, { recursive: true });
    fs.mkdirSync(sourceDir, { recursive: true });
    const baselineSource = fs.readFileSync(path.resolve("scripts", "baselines", "preferences.xhtml.txt"), "utf-8");
    fs.writeFileSync(path.join(sourceDir, "preferences.xhtml.txt"), baselineSource, "utf-8");
    fs.writeFileSync(path.join(targetDir, "preferences.xhtml"), "<vbox id=\"customized\"/>\n", "utf-8");

    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "preferences:preference-pane-resource-drift",
        feature: "preferences",
        featureLabel: "偏好设置面板",
        candidateFiles: ["addon-static/content/preferences.xhtml"],
      },
    });

    const result = await applyPatchPlan(tempRoot, plan);
    const updated = fs.readFileSync(path.join(targetDir, "preferences.xhtml"), "utf-8");

    assert.equal(result.attempted, true);
    assert.equal(result.ok, true);
    assert.equal(result.status, "applied");
    assert.equal(updated, baselineSource);
  });

  it("should copy a drifted runtime style resource file back to the clean-room baseline", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-style-resource-drift-"));
    const targetDir = path.join(tempRoot, "addon-static", "content", "style");
    const sourceDir = path.join(tempRoot, "scripts", "baselines");
    fs.mkdirSync(targetDir, { recursive: true });
    fs.mkdirSync(sourceDir, { recursive: true });
    const baselineSource = fs.readFileSync(path.resolve("scripts", "baselines", "main.css.txt"), "utf-8");
    fs.writeFileSync(path.join(sourceDir, "main.css.txt"), baselineSource, "utf-8");
    fs.writeFileSync(path.join(targetDir, "main.css"), "#cleanroom-template-menuitem {\n  color: red;\n}\n", "utf-8");

    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "runtime-logs:style-sheet-resource-drift",
        feature: "runtime-logs",
        featureLabel: "运行时日志与资源加载",
        candidateFiles: ["addon-static/content/style/main.css"],
      },
    });

    const result = await applyPatchPlan(tempRoot, plan);
    const updated = fs.readFileSync(path.join(targetDir, "main.css"), "utf-8");

    assert.equal(result.attempted, true);
    assert.equal(result.ok, true);
    assert.equal(result.status, "applied");
    assert.equal(updated, baselineSource);
  });

  it("should refuse to apply patch when anchor is missing", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-patch-missing-"));
    const targetDir = path.join(tempRoot, "src", "app");
    fs.mkdirSync(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, "feature-composer.js");
    fs.writeFileSync(targetFile, `export function createFeatureComposer() {
  async function registerBaselineFeatures() {
    logger.info("plugin.baseline.ready", {});
  }
}
`, "utf-8");

    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "item-pane:item-pane-section-missing",
        feature: "item-pane",
        featureLabel: "ItemPane 注册",
        candidateFiles: ["src/app/feature-composer.js"],
      },
    });

    const result = await applyPatchPlan(tempRoot, plan);

    assert.equal(result.attempted, true);
    assert.equal(result.ok, false);
    assert.equal(result.status, "precheck-failed");
    assert.equal(result.results[0].reason, "anchor-not-found");
  });

  it("should refuse to apply patch when target file is missing", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-patch-missing-file-"));

    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "localization:item-pane-section-header-ftl-key-missing",
        feature: "localization",
        featureLabel: "本地化引用修正",
        issue: "Locale zh-CN 缺少 FTL key cleanroom-item-pane-section-header。",
        candidateFiles: ["addon-static/locale/zh-CN/main.ftl"],
      },
    });

    const result = await applyPatchPlan(tempRoot, plan);

    assert.equal(result.attempted, true);
    assert.equal(result.ok, false);
    assert.equal(result.status, "precheck-failed");
    assert.equal(result.results[0].reason, "target-file-missing");
  });

  it("should refuse to apply patch when anchor is not unique", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-patch-duplicate-"));
    const targetDir = path.join(tempRoot, "src", "app");
    fs.mkdirSync(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, "feature-composer.js");
    fs.writeFileSync(targetFile, `export function createFeatureComposer() {
  async function registerBaselineFeatures() {
    itemPane.registerInfoRow({
      rowID: demoInfoRowID,
    });
    notifier.subscribe(
      ["item", "file", "tab"],
      () => {},
      { id: demoNotifierID },
    );
    notifier.subscribe(
      ["item", "file", "tab"],
      () => {},
      { id: demoNotifierID },
    );
  }
}
`, "utf-8");

    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "item-pane:item-pane-section-missing",
        feature: "item-pane",
        featureLabel: "ItemPane 注册",
        candidateFiles: ["src/app/feature-composer.js"],
      },
    });

    const result = await applyPatchPlan(tempRoot, plan);

    assert.equal(result.attempted, true);
    assert.equal(result.ok, false);
    assert.equal(result.status, "precheck-failed");
    assert.equal(result.results[0].reason, "anchor-not-unique");
    assert.equal(result.results[0].anchorCount, 2);
  });

  it("should refuse to apply patch when before context mismatches", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-patch-context-before-"));
    const targetDir = path.join(tempRoot, "src", "app");
    fs.mkdirSync(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, "feature-composer.js");
    fs.writeFileSync(targetFile, `export function createFeatureComposer() {
  async function registerBaselineFeatures() {
    itemTree.registerColumn({
      dataKey: demoColumnKey,
    });
    notifier.subscribe(
      ["item", "file", "tab"],
      () => {},
      {
        id: demoNotifierID,
      },
    );
    logger.info("plugin.baseline.ready", {});
  }
}
`, "utf-8");

    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "item-pane:item-pane-section-missing",
        feature: "item-pane",
        featureLabel: "ItemPane 注册",
        candidateFiles: ["src/app/feature-composer.js"],
      },
    });

    const result = await applyPatchPlan(tempRoot, plan);

    assert.equal(result.attempted, true);
    assert.equal(result.ok, false);
    assert.equal(result.status, "precheck-failed");
    assert.equal(result.results[0].reason, "before-context-mismatch");
    assert.equal(result.results[0].beforeContextMatched, false);
    assert.equal(result.results[0].afterContextMatched, true);
  });

  it("should detect already patched snippet with normalized whitespace", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-patch-normalized-"));
    const targetDir = path.join(tempRoot, "src", "app");
    fs.mkdirSync(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, "feature-composer.js");
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "item-pane:item-pane-section-missing",
        feature: "item-pane",
        featureLabel: "ItemPane 注册",
        candidateFiles: ["src/app/feature-composer.js"],
      },
    });
    const sectionDraft = plan.patchDrafts[0];
    const normalizedSnippet = String(sectionDraft.snippet || "")
      .replace(/\s+/gu, " ")
      .trim();
    fs.writeFileSync(targetFile, `export function createFeatureComposer() {
  async function registerBaselineFeatures() {
    itemPane.registerInfoRow({
      rowID: demoInfoRowID,
    });
    ${normalizedSnippet}
    notifier.subscribe(
      ["item", "file", "tab"],
      () => {},
      {
        id: demoNotifierID,
      },
    );
    logger.info("plugin.baseline.ready", {});
  }
}
`, "utf-8");

    const result = await applyPatchPlan(tempRoot, plan);

    assert.equal(result.attempted, true);
    assert.equal(result.ok, false);
    assert.equal(result.status, "precheck-failed");
    assert.equal(result.results[0].reason, "target-already-contains-snippet");
    assert.equal(result.results[0].snippetPresent, true);
    assert.equal(result.results[0].snippetMatchMode, "normalized");
  });

  it("should apply a lifecycle patch draft into kernel start sequence when anchor exists", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-lifecycle-patch-"));
    const targetDir = path.join(tempRoot, "src", "app");
    fs.mkdirSync(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, "kernel.js");
    fs.writeFileSync(targetFile, `export function createPluginKernel({
  startServices = null,
  registerBaselineFeatures,
  windows,
  runtime,
}) {
  async function start() {
    if (typeof startServices === "function") {
      await startServices();
    }

    windows.loadAll(mainWindows);
    runtime.markRunning();
  }
}
`, "utf-8");

    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "lifecycle:baseline-registration-missing",
        feature: "lifecycle",
        featureLabel: "生命周期与基线注册",
        candidateFiles: ["src/app/kernel.js"],
      },
    });

    const result = await applyPatchPlan(tempRoot, plan);
    const updated = fs.readFileSync(targetFile, "utf-8");

    assert.equal(result.attempted, true);
    assert.equal(result.ok, true);
    assert.ok(result.appliedFiles.includes("src/app/kernel.js"));
    assert.ok(updated.includes("await registerBaselineFeatures();"));
    assert.ok(updated.indexOf("await registerBaselineFeatures();") < updated.indexOf("windows.loadAll(mainWindows);"));
  });

  it("should apply a config replace patch draft when match exists", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-config-patch-"));
    const targetDir = path.join(tempRoot, "config");
    fs.mkdirSync(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, "addon.config.json");
    fs.writeFileSync(targetFile, `{
  "defaultPrefs": {
    "enabled": false,
    "menuLabel": "",
    "logLevel": "info"
  }
}
`, "utf-8");

    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "config:default-enabled-disabled",
        feature: "config",
        featureLabel: "默认配置修正",
        candidateFiles: ["config/addon.config.json"],
      },
    });

    const result = await applyPatchPlan(tempRoot, plan);
    const updated = fs.readFileSync(targetFile, "utf-8");

    assert.equal(result.attempted, true);
    assert.equal(result.ok, true);
    assert.ok(result.appliedFiles.includes("config/addon.config.json"));
    assert.ok(updated.includes('"enabled": true'));
    assert.equal(updated.includes('"enabled": false'), false);
  });

  it("should apply a localization replace patch draft when l10n id drifts", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-l10n-patch-"));
    const targetDir = path.join(tempRoot, "src", "app");
    fs.mkdirSync(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, "feature-composer.js");
    fs.writeFileSync(targetFile, `export function createFeatureComposer() {
  async function registerBaselineFeatures() {
    itemPane.registerInfoRow({
      rowID: demoInfoRowID,
      label: {
        l10nID: "cleanroom-item-pane-info-row-label-typo",
      },
      position: "afterCreators",
    });
  }
}
`, "utf-8");

    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "localization:item-pane-info-row-l10n-id-drift",
        feature: "localization",
        featureLabel: "本地化引用修正",
        issue: "ItemPane InfoRow l10nID 漂移：期望 cleanroom-item-pane-info-row-label，实际 cleanroom-item-pane-info-row-label-typo。",
        candidateFiles: ["src/app/feature-composer.js"],
      },
    });

    const result = await applyPatchPlan(tempRoot, plan);
    const updated = fs.readFileSync(targetFile, "utf-8");

    assert.equal(result.attempted, true);
    assert.equal(result.ok, true);
    assert.ok(result.appliedFiles.includes("src/app/feature-composer.js"));
    assert.ok(updated.includes('l10nID: "cleanroom-item-pane-info-row-label",'));
    assert.equal(updated.includes('l10nID: "cleanroom-item-pane-info-row-label-typo",'), false);
  });

  it("should append a missing locale ftl key when locale resource drifts", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-locale-ftl-patch-"));
    const targetDir = path.join(tempRoot, "addon-static", "locale", "zh-CN");
    fs.mkdirSync(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, "main.ftl");
    fs.writeFileSync(targetFile, `cleanroom-menu-label = 打开模板动作
cleanroom-dialog-title = 模板插件
cleanroom-dialog-body = 插件命令执行成功。
cleanroom-item-pane-info-row-label = 模板摘要
cleanroom-item-pane-section-sidenav =
    .tooltiptext = 模板示例
`, "utf-8");

    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "localization:item-pane-section-header-ftl-key-missing",
        feature: "localization",
        featureLabel: "本地化引用修正",
        issue: "Locale zh-CN 缺少 FTL key cleanroom-item-pane-section-header。",
        candidateFiles: ["addon-static/locale/zh-CN/main.ftl"],
      },
    });

    const result = await applyPatchPlan(tempRoot, plan);
    const updated = fs.readFileSync(targetFile, "utf-8");

    assert.equal(result.attempted, true);
    assert.equal(result.ok, true);
    assert.ok(result.appliedFiles.includes("addon-static/locale/zh-CN/main.ftl"));
    assert.ok(updated.includes("cleanroom-item-pane-section-header =\n    .label = 模板示例"));
  });

  it("should create missing locale main ftl from minimal baseline", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-locale-ftl-create-"));

    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "localization:item-pane-section-header-ftl-key-missing",
        feature: "localization",
        featureLabel: "本地化引用修正",
        issue: "Locale zh-CN 缺少 FTL key cleanroom-item-pane-section-header（文件 addon-static/locale/zh-CN/main.ftl 不存在）。",
        candidateFiles: ["addon-static/locale/zh-CN/main.ftl"],
      },
    });

    const result = await applyPatchPlan(tempRoot, plan);
    const targetFile = path.join(tempRoot, "addon-static", "locale", "zh-CN", "main.ftl");
    const created = fs.readFileSync(targetFile, "utf-8");

    assert.equal(result.attempted, true);
    assert.equal(result.ok, true);
    assert.ok(result.appliedFiles.includes("addon-static/locale/zh-CN/main.ftl"));
    assert.equal(result.precheck[0].reason, "ready");
    assert.ok(created.includes("cleanroom-menu-label = 打开模板动作"));
    assert.ok(created.includes("cleanroom-dialog-title = 模板插件"));
    assert.ok(created.includes("cleanroom-item-pane-section-header =\n    .label = 模板示例"));
    assert.ok(created.includes("cleanroom-item-pane-section-sidenav =\n    .tooltiptext = 模板示例"));
  });

  it("should replace a drifted locale ftl value when locale resource drifts", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-locale-ftl-value-patch-"));
    const targetDir = path.join(tempRoot, "addon-static", "locale", "zh-CN");
    fs.mkdirSync(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, "main.ftl");
    fs.writeFileSync(targetFile, `cleanroom-menu-label = 打开模板动作
cleanroom-dialog-title = 模板插件
cleanroom-dialog-body = 插件命令执行成功。
cleanroom-item-pane-info-row-label = 模板摘要
cleanroom-item-pane-section-header =
    .label = 模板示例-错误
cleanroom-item-pane-section-sidenav =
    .tooltiptext = 模板示例
`, "utf-8");

    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "localization:item-pane-section-header-ftl-value-drift",
        feature: "localization",
        featureLabel: "本地化引用修正",
        issue: "Locale zh-CN FTL key cleanroom-item-pane-section-header 值漂移：期望 模板示例，实际 模板示例-错误。 实际定义片段 [cleanroom-item-pane-section-header =\\n    .label = 模板示例-错误]。",
        candidateFiles: ["addon-static/locale/zh-CN/main.ftl"],
      },
    });

    const result = await applyPatchPlan(tempRoot, plan);
    const updated = fs.readFileSync(targetFile, "utf-8");

    assert.equal(result.attempted, true);
    assert.equal(result.ok, true);
    assert.ok(result.appliedFiles.includes("addon-static/locale/zh-CN/main.ftl"));
    assert.ok(updated.includes("cleanroom-item-pane-section-header =\n    .label = 模板示例"));
    assert.equal(updated.includes("    .label = 模板示例-错误"), false);
  });

  it("should repair locale ftl structure drift with canonical block replacement", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-locale-structure-apply-"));
    const targetDir = path.join(tempRoot, "addon-static", "locale", "zh-CN");
    fs.mkdirSync(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, "main.ftl");
    fs.writeFileSync(targetFile, `cleanroom-menu-label = 打开模板动作
cleanroom-dialog-title = 模板插件
cleanroom-dialog-body = 插件命令执行成功。
cleanroom-item-pane-info-row-label = 模板摘要
cleanroom-item-pane-section-header = 模板示例
cleanroom-item-pane-section-sidenav =
    .tooltiptext = 模板示例
`, "utf-8");

    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "localization:item-pane-section-header-ftl-structure-drift",
        feature: "localization",
        featureLabel: "本地化引用修正",
        issue: "Locale zh-CN FTL key cleanroom-item-pane-section-header 结构漂移：期望定义片段 [cleanroom-item-pane-section-header =\\n    .label = 模板示例]，实际定义片段 [cleanroom-item-pane-section-header = 模板示例]。",
        candidateFiles: ["addon-static/locale/zh-CN/main.ftl"],
      },
    });

    const result = await applyPatchPlan(tempRoot, plan);
    const updated = fs.readFileSync(targetFile, "utf-8");

    assert.equal(result.attempted, true);
    assert.equal(result.ok, true);
    assert.ok(result.appliedFiles.includes("addon-static/locale/zh-CN/main.ftl"));
    assert.ok(updated.includes("cleanroom-item-pane-section-header =\n    .label = 模板示例"));
    assert.equal(updated.includes("cleanroom-item-pane-section-header = 模板示例"), false);
  });

  it("should evaluate patch verification contract with rule-specific checks", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "item-pane:item-pane-section-missing",
        feature: "item-pane",
        featureLabel: "ItemPane 注册",
        candidateFiles: ["src/app/feature-composer.js"],
      },
    });

    const verification = evaluatePatchVerificationContract({
      patchPlan: plan,
      patchApplication: {
        attempted: true,
        appliedFiles: ["src/app/feature-composer.js"],
      },
      latestReport: {
        primaryDiagnosis: {
          fingerprint: "notifier:notifier-inactive",
        },
        cycles: [{
          checks: {
            itemPaneSections: 1,
          },
        }],
      },
      recovered: false,
    });

    assert.equal(verification.status, "verification-passed");
    assert.equal(verification.failedRequiredCount, 0);
    assert.equal(verification.checks.some((check) => check.id === "restart-e2e"), true);
    assert.equal(verification.checks.some((check) => check.id === "item-pane-section-count" && check.satisfied === true), true);
  });

  it("should evaluate localization patch verification contract with drift count check", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "localization:item-pane-info-row-l10n-id-drift",
        feature: "localization",
        featureLabel: "本地化引用修正",
        issue: "ItemPane InfoRow l10nID 漂移：期望 cleanroom-item-pane-info-row-label，实际 cleanroom-item-pane-info-row-label-typo。",
        candidateFiles: ["src/app/feature-composer.js"],
      },
    });

    const verification = evaluatePatchVerificationContract({
      patchPlan: plan,
      patchApplication: {
        attempted: true,
        appliedFiles: ["src/app/feature-composer.js"],
      },
      latestReport: {
        primaryDiagnosis: {
          fingerprint: "menu-action:primary-action-failed",
        },
        cycles: [
          {
            index: 1,
            checks: {
              itemPaneL10nDriftCount: 0,
              itemPaneInfoRows: 1,
            },
          },
          {
            index: 2,
            checks: {
              itemPaneL10nDriftCount: 0,
              itemPaneInfoRows: 1,
            },
          },
        ],
      },
      recovered: false,
    });

    assert.equal(verification.status, "verification-passed");
    assert.equal(verification.checks.some((check) => check.id === "item-pane-l10n-drift-count" && check.kind === "all-cycle-check" && check.satisfied === true), true);
  });

  it("should evaluate locale ftl patch verification contract with missing count check", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "localization:item-pane-section-header-ftl-key-missing",
        feature: "localization",
        featureLabel: "本地化引用修正",
        issue: "Locale zh-CN 缺少 FTL key cleanroom-item-pane-section-header。",
        candidateFiles: ["addon-static/locale/zh-CN/main.ftl"],
      },
    });

    const verification = evaluatePatchVerificationContract({
      patchPlan: plan,
      patchApplication: {
        attempted: true,
        appliedFiles: ["addon-static/locale/zh-CN/main.ftl"],
      },
      latestReport: {
        primaryDiagnosis: {
          fingerprint: "menu-action:primary-action-failed",
        },
        cycles: [
          {
            index: 1,
            checks: {
              localeFTLMissingCount: 0,
            },
          },
          {
            index: 2,
            checks: {
              localeFTLMissingCount: 0,
            },
          },
        ],
      },
      recovered: false,
    });

    assert.equal(verification.status, "verification-passed");
    assert.equal(verification.checks.some((check) => check.id === "locale-ftl-missing-count" && check.kind === "all-cycle-check" && check.satisfied === true), true);
  });

  it("should evaluate locale ftl value patch verification contract with drift count check", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "localization:item-pane-section-header-ftl-value-drift",
        feature: "localization",
        featureLabel: "本地化引用修正",
        issue: "Locale zh-CN FTL key cleanroom-item-pane-section-header 值漂移：期望 模板示例，实际 模板示例-错误。 实际定义片段 [cleanroom-item-pane-section-header =\\n    .label = 模板示例-错误]。",
        candidateFiles: ["addon-static/locale/zh-CN/main.ftl"],
      },
    });

    const verification = evaluatePatchVerificationContract({
      patchPlan: plan,
      patchApplication: {
        attempted: true,
        appliedFiles: ["addon-static/locale/zh-CN/main.ftl"],
      },
      latestReport: {
        primaryDiagnosis: {
          fingerprint: "menu-action:primary-action-failed",
        },
        cycles: [
          {
            index: 1,
            checks: {
              localeFTLValueDriftCount: 0,
            },
          },
          {
            index: 2,
            checks: {
              localeFTLValueDriftCount: 0,
            },
          },
        ],
      },
      recovered: false,
    });

    assert.equal(verification.status, "verification-passed");
    assert.equal(verification.checks.some((check) => check.id === "locale-ftl-value-drift-count" && check.kind === "all-cycle-check" && check.satisfied === true), true);
  });

  it("should evaluate locale ftl structure patch verification contract with drift count check", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "localization:item-pane-section-header-ftl-structure-drift",
        feature: "localization",
        featureLabel: "本地化引用修正",
        issue: "Locale zh-CN FTL key cleanroom-item-pane-section-header 结构漂移：期望定义片段 [cleanroom-item-pane-section-header =\\n    .label = 模板示例]，实际定义片段 [cleanroom-item-pane-section-header = 模板示例]。",
        candidateFiles: ["addon-static/locale/zh-CN/main.ftl"],
      },
    });

    const verification = evaluatePatchVerificationContract({
      patchPlan: plan,
      patchApplication: {
        attempted: true,
        appliedFiles: ["addon-static/locale/zh-CN/main.ftl"],
      },
      latestReport: {
        primaryDiagnosis: {
          fingerprint: "menu-action:primary-action-failed",
        },
        cycles: [
          {
            index: 1,
            checks: {
              localeFTLStructureDriftCount: 0,
            },
          },
          {
            index: 2,
            checks: {
              localeFTLStructureDriftCount: 0,
            },
          },
        ],
      },
      recovered: false,
    });

    assert.equal(verification.status, "verification-passed");
    assert.equal(verification.checks.some((check) => check.id === "locale-ftl-structure-drift-count" && check.kind === "all-cycle-check" && check.satisfied === true), true);
  });

  it("should fail localization verification when earlier cycle still has l10n drift", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "localization:item-pane-info-row-l10n-id-drift",
        feature: "localization",
        featureLabel: "本地化引用修正",
        issue: "ItemPane InfoRow l10nID 漂移：期望 cleanroom-item-pane-info-row-label，实际 cleanroom-item-pane-info-row-label-typo。",
        candidateFiles: ["src/app/feature-composer.js"],
      },
    });

    const verification = evaluatePatchVerificationContract({
      patchPlan: plan,
      patchApplication: {
        attempted: true,
        appliedFiles: ["src/app/feature-composer.js"],
      },
      latestReport: {
        primaryDiagnosis: {
          fingerprint: "menu-action:primary-action-failed",
        },
        cycles: [
          {
            index: 1,
            checks: {
              itemPaneL10nDriftCount: 1,
              itemPaneInfoRows: 1,
            },
          },
          {
            index: 2,
            checks: {
              itemPaneL10nDriftCount: 0,
              itemPaneInfoRows: 1,
            },
          },
        ],
      },
      recovered: false,
    });

    assert.equal(verification.status, "verification-failed");
    assert.equal(verification.checks.some((check) => (
      check.id === "item-pane-l10n-drift-count"
      && check.kind === "all-cycle-check"
      && check.satisfied === false
      && Array.isArray(check.actual)
      && check.actual[0].cycleIndex === 1
      && check.actual[0].satisfied === false
    )), true);
  });

  it("should evaluate reader visual patch verification contract with report-level drift count check", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-visual-verify-"));
    const sourceFile = path.join(tempRoot, "dist", "agent-zotero-e2e-assets", "cycle-2-reader.png");
    const targetFile = path.join(tempRoot, "tests", "visual-baselines", "agent-zotero-e2e", "hot-reload-reader.png");
    fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
    fs.writeFileSync(sourceFile, Buffer.from("reader-visual-source"));
    const sourceHash = crypto.createHash("sha256").update(fs.readFileSync(sourceFile)).digest("hex");

    const plan = derivePatchPlan({
      projectRoot: tempRoot,
      passed: false,
      primaryDiagnosis: {
        fingerprint: "reader-ui:reader-visual-drift",
        feature: "reader-ui",
        featureLabel: "Reader 与视觉回归",
        candidateFiles: ["tests/visual-baselines/agent-zotero-e2e/hot-reload-reader.png"],
      },
      cycles: [{
        index: 2,
        bootMode: "hot-reload",
        visuals: {
          captures: [{
            kind: "reader",
            path: sourceFile,
            analysis: {
              sha256: sourceHash,
            },
          }],
          analysis: {
            baselines: [{
              kind: "reader",
              bootMode: "hot-reload",
              path: targetFile,
              status: "compared",
              ok: false,
            }],
            summary: {
              baseline: {
                driftCount: 1,
              },
            },
          },
        },
      }],
    });

    const verification = evaluatePatchVerificationContract({
      patchPlan: plan,
      patchApplication: {
        attempted: true,
        appliedFiles: ["tests/visual-baselines/agent-zotero-e2e/hot-reload-reader.png"],
      },
      latestReport: {
        primaryDiagnosis: {
          fingerprint: "menu-action:primary-action-failed",
        },
        cycles: [{
          visuals: {
            analysis: {
              summary: {
                baseline: {
                  driftCount: 0,
                  missingCount: 0,
                  errorCount: 0,
                },
              },
            },
          },
        }],
      },
      recovered: false,
    });

    assert.equal(verification.status, "verification-passed");
    assert.equal(verification.checks.some((check) => (
      check.id === "visual-drift-count"
      && check.kind === "report-field"
      && check.satisfied === true
      && check.actual === 0
    )), true);
    assert.equal(verification.checks.some((check) => (
      check.id === "visual-missing-count"
      && check.kind === "report-field"
      && check.satisfied === true
      && check.actual === 0
    )), true);
    assert.equal(verification.checks.some((check) => (
      check.id === "visual-error-count"
      && check.kind === "report-field"
      && check.satisfied === true
      && check.actual === 0
    )), true);
  });

  it("should evaluate reader entry menu patch verification contract with menu checks", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "reader-entry:reader-summary-menu-missing",
        feature: "reader-entry",
        featureLabel: "Reader 命令与菜单入口",
        candidateFiles: ["src/app/feature-composer.js"],
      },
    });

    const verification = evaluatePatchVerificationContract({
      patchPlan: plan,
      patchApplication: {
        attempted: true,
        appliedFiles: ["src/app/feature-composer.js"],
      },
      latestReport: {
        primaryDiagnosis: {
          fingerprint: "menu-action:primary-action-failed",
        },
        cycles: [
          {
            index: 1,
            checks: {
              officialMenuAPIAvailable: true,
              readerSummaryMenuRegistered: true,
            },
          },
          {
            index: 2,
            checks: {
              officialMenuAPIAvailable: true,
              readerSummaryMenuRegistered: true,
            },
          },
        ],
      },
      recovered: false,
    });

    assert.equal(verification.status, "verification-passed");
    assert.equal(verification.checks.some((check) => check.id === "official-menu-api-available" && check.satisfied === true), true);
    assert.equal(verification.checks.some((check) => check.id === "reader-summary-menu-registered" && check.satisfied === true), true);
  });

  it("should evaluate primary action command patch verification contract with command checks", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "menu-action:primary-command-missing",
        feature: "menu-action",
        featureLabel: "主命令与菜单动作",
        candidateFiles: ["src/app/feature-composer.js"],
      },
    });

    const verification = evaluatePatchVerificationContract({
      patchPlan: plan,
      patchApplication: {
        attempted: true,
        appliedFiles: ["src/app/feature-composer.js"],
      },
      latestReport: {
        primaryDiagnosis: {
          fingerprint: "menu-action:primary-action-failed",
        },
        cycles: [
          {
            index: 1,
            checks: {
              primaryActionCommandRegistered: true,
            },
          },
          {
            index: 2,
            checks: {
              primaryActionCommandRegistered: true,
            },
          },
        ],
      },
      recovered: false,
    });

    assert.equal(verification.status, "verification-passed");
    assert.equal(verification.checks.some((check) => check.id === "primary-action-command-registered" && check.satisfied === true), true);
  });

  it("should evaluate context menu patch verification contract with menu checks", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "menu-action:context-menu-missing",
        feature: "menu-action",
        featureLabel: "主命令与菜单动作",
        candidateFiles: ["src/app/feature-composer.js"],
      },
    });

    const verification = evaluatePatchVerificationContract({
      patchPlan: plan,
      patchApplication: {
        attempted: true,
        appliedFiles: ["src/app/feature-composer.js"],
      },
      latestReport: {
        primaryDiagnosis: {
          fingerprint: "menu-action:primary-action-failed",
        },
        cycles: [
          {
            index: 1,
            checks: {
              officialMenuAPIAvailable: true,
              contextActionMenuRegistered: true,
            },
          },
          {
            index: 2,
            checks: {
              officialMenuAPIAvailable: true,
              contextActionMenuRegistered: true,
            },
          },
        ],
      },
      recovered: false,
    });

    assert.equal(verification.status, "verification-passed");
    assert.equal(verification.checks.some((check) => check.id === "context-action-menu-registered" && check.satisfied === true), true);
  });

  it("should evaluate preference pane patch verification contract with pane checks", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "preferences:preference-pane-missing",
        feature: "preferences",
        featureLabel: "偏好设置面板",
        candidateFiles: ["src/app/feature-composer.js"],
      },
    });

    const verification = evaluatePatchVerificationContract({
      patchPlan: plan,
      patchApplication: {
        attempted: true,
        appliedFiles: ["src/app/feature-composer.js"],
      },
      latestReport: {
        primaryDiagnosis: {
          fingerprint: "menu-action:primary-action-failed",
        },
        cycles: [
          {
            index: 1,
            checks: {
              preferencePaneRegistered: true,
              preferencePaneCount: 1,
            },
          },
          {
            index: 2,
            checks: {
              preferencePaneRegistered: true,
              preferencePaneCount: 1,
            },
          },
        ],
      },
      recovered: false,
    });

    assert.equal(verification.status, "verification-passed");
    assert.equal(verification.checks.some((check) => check.id === "preference-pane-registered" && check.satisfied === true), true);
    assert.equal(verification.checks.some((check) => check.id === "preference-pane-count" && check.satisfied === true), true);
  });

  it("should evaluate aggregated report-field verification checks from multi-cycle report", () => {
    const verification = evaluatePatchVerificationContract({
      patchPlan: {
        fingerprint: "custom:aggregate-checks",
        verificationContract: {
          summary: "验证聚合报告字段。",
          checks: [
            {
              id: "cycle-failed-count",
              label: "失败轮次数",
              kind: "report-field",
              field: "cycleFailedCount",
              operator: "equals",
              expected: 1,
            },
            {
              id: "service-degraded-cycles",
              label: "服务退化轮次数",
              kind: "report-field",
              field: "serviceDegradedCycleCount",
              operator: "equals",
              expected: 1,
            },
            {
              id: "error-log-count",
              label: "错误日志总数",
              kind: "report-field",
              field: "errorLogCount",
              operator: "equals",
              expected: 3,
            },
            {
              id: "static-runtime-missing-count",
              label: "静态运行时缺失总数",
              kind: "report-field",
              field: "staticRuntimeMissingCount",
              operator: "equals",
              expected: 3,
            },
          ],
        },
      },
      patchApplication: {
        attempted: true,
        appliedFiles: ["src/app/feature-composer.js"],
      },
      latestReport: {
        primaryDiagnosis: {
          fingerprint: "custom:other",
        },
        cycles: [
          {
            index: 1,
            passed: false,
            checks: {
              serviceHealthOK: false,
              serviceUnhealthyCount: 1,
              staticRuntimeMissingCount: 2,
            },
            logs: {
              errorCount: 2,
              warnCount: 1,
            },
          },
          {
            index: 2,
            passed: true,
            checks: {
              serviceHealthOK: true,
              serviceUnhealthyCount: 0,
              staticRuntimeMissingCount: 1,
            },
            logs: {
              errorCount: 1,
              warnCount: 0,
            },
          },
        ],
      },
      recovered: false,
    });

    assert.equal(verification.status, "verification-passed");
    assert.equal(verification.checks.some((check) => check.id === "cycle-failed-count" && check.actual === 1 && check.satisfied === true), true);
    assert.equal(verification.checks.some((check) => check.id === "service-degraded-cycles" && check.actual === 1 && check.satisfied === true), true);
    assert.equal(verification.checks.some((check) => check.id === "error-log-count" && check.actual === 3 && check.satisfied === true), true);
    assert.equal(verification.checks.some((check) => check.id === "static-runtime-missing-count" && check.actual === 3 && check.satisfied === true), true);
  });

  it("should ignore failed optional verification checks when required checks pass", () => {
    const verification = evaluatePatchVerificationContract({
      patchPlan: {
        fingerprint: "custom:optional-checks",
        verificationContract: {
          summary: "验证观察项不阻断通过。",
          checks: [
            {
              id: "required-check",
              label: "必需检查",
              kind: "report-field",
              field: "cycleFailedCount",
              operator: "equals",
              expected: 0,
            },
            {
              id: "optional-check",
              label: "观察检查",
              kind: "report-field",
              field: "warnLogCount",
              operator: "equals",
              expected: 0,
              required: false,
            },
          ],
        },
      },
      patchApplication: {
        attempted: true,
        appliedFiles: ["src/app/feature-composer.js"],
      },
      latestReport: {
        primaryDiagnosis: {
          fingerprint: "custom:other",
        },
        cycles: [
          {
            index: 1,
            passed: true,
            logs: {
              errorCount: 0,
              warnCount: 2,
            },
          },
        ],
      },
      recovered: false,
    });

    assert.equal(verification.status, "verification-passed");
    assert.equal(verification.failedRequiredCount, 0);
    assert.equal(verification.checks.some((check) => (
      check.id === "optional-check"
      && check.required === false
      && check.satisfied === false
      && check.actual === 2
    )), true);
  });

  it("should keep registration verification passed when only observation checks fail", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "item-tree:item-tree-column-missing",
        feature: "item-tree",
        featureLabel: "ItemTree 自定义列",
        candidateFiles: ["src/app/feature-composer.js"],
      },
    });

    const verification = evaluatePatchVerificationContract({
      patchPlan: plan,
      patchApplication: {
        attempted: true,
        appliedFiles: ["src/app/feature-composer.js"],
      },
      latestReport: {
        primaryDiagnosis: {
          fingerprint: "menu-action:primary-action-failed",
        },
        cycles: [
          {
            index: 1,
            passed: true,
            checks: {
              itemTreeColumns: 1,
              serviceHealthOK: false,
              serviceUnhealthyCount: 1,
            },
            tests: {
              failed: 1,
            },
            scenarios: {
              failed: 0,
            },
            logs: {
              errorCount: 2,
              warnCount: 0,
            },
          },
          {
            index: 2,
            passed: true,
            checks: {
              itemTreeColumns: 1,
              serviceHealthOK: true,
              serviceUnhealthyCount: 0,
            },
            tests: {
              failed: 0,
            },
            scenarios: {
              failed: 0,
            },
            logs: {
              errorCount: 0,
              warnCount: 1,
            },
          },
        ],
      },
      recovered: false,
    });

    assert.equal(verification.status, "verification-passed");
    assert.equal(verification.failedRequiredCount, 0);
    assert.equal(verification.checks.some((check) => (
      check.id === "item-tree-column-count"
      && check.required === true
      && check.satisfied === true
    )), true);
    assert.equal(verification.checks.some((check) => (
      check.id === "error-log-count"
      && check.required === false
      && check.satisfied === false
      && check.actual === 2
    )), true);
    assert.equal(verification.checks.some((check) => (
      check.id === "test-failed-count"
      && check.required === false
      && check.satisfied === false
      && check.actual === 1
    )), true);
  });

  it("should fail all-cycle verification when earlier cycle remains unsatisfied", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "reader-entry:reader-summary-command-missing",
        feature: "reader-entry",
        featureLabel: "Reader 命令与菜单入口",
        candidateFiles: ["src/app/feature-composer.js"],
      },
    });

    const verification = evaluatePatchVerificationContract({
      patchPlan: plan,
      patchApplication: {
        attempted: true,
        appliedFiles: ["src/app/feature-composer.js"],
      },
      latestReport: {
        primaryDiagnosis: {
          fingerprint: "menu-action:primary-action-failed",
        },
        cycles: [
          {
            index: 1,
            checks: {
              readerSummaryCommandRegistered: false,
            },
          },
          {
            index: 2,
            checks: {
              readerSummaryCommandRegistered: true,
            },
          },
        ],
      },
      recovered: false,
    });

    assert.equal(verification.status, "verification-failed");
    assert.equal(verification.checks.some((check) => (
      check.id === "reader-summary-command-registered"
      && check.kind === "all-cycle-check"
      && check.satisfied === false
      && Array.isArray(check.actual)
      && check.actual[0].cycleIndex === 1
      && check.actual[0].satisfied === false
    )), true);
  });

  it("should fail patch verification contract when rule-specific checks remain unsatisfied", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "notifier:notifier-inactive",
        feature: "notifier",
        featureLabel: "Notifier 事件订阅",
        candidateFiles: ["src/app/feature-composer.js"],
      },
    });

    const verification = evaluatePatchVerificationContract({
      patchPlan: plan,
      patchApplication: {
        attempted: true,
        appliedFiles: ["src/app/feature-composer.js"],
      },
      latestReport: {
        primaryDiagnosis: {
          fingerprint: "notifier:notifier-inactive",
        },
        cycles: [{
          checks: {
            notifierActiveCount: 0,
          },
        }],
      },
      recovered: false,
    });

    assert.equal(verification.status, "verification-failed");
    assert.equal(verification.failedRequiredCount >= 1, true);
    assert.equal(verification.checks.some((check) => check.id === "notifier-active-count" && check.satisfied === false), true);
  });

  it("should evaluate lifecycle patch verification contract with all baseline checks", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "lifecycle:baseline-registration-missing",
        feature: "lifecycle",
        featureLabel: "生命周期与基线注册",
        candidateFiles: ["src/app/kernel.js"],
      },
    });

    const verification = evaluatePatchVerificationContract({
      patchPlan: plan,
      patchApplication: {
        attempted: true,
        appliedFiles: ["src/app/kernel.js"],
      },
      latestReport: {
        primaryDiagnosis: {
          fingerprint: "item-pane:item-pane-section-missing",
        },
        cycles: [
          {
            index: 1,
            checks: {
              itemPaneSections: 1,
              itemPaneInfoRows: 1,
              itemTreeColumns: 1,
              notifierActiveCount: 1,
            },
          },
          {
            index: 2,
            checks: {
              itemPaneSections: 1,
              itemPaneInfoRows: 1,
              itemTreeColumns: 1,
              notifierActiveCount: 1,
            },
          },
        ],
      },
      recovered: false,
    });

    assert.equal(verification.status, "verification-passed");
    assert.equal(verification.checks.some((check) => check.id === "item-pane-info-row-count" && check.satisfied === true), true);
    assert.equal(verification.checks.some((check) => check.id === "item-tree-column-count" && check.satisfied === true), true);
    assert.equal(verification.checks.some((check) => check.id === "notifier-active-count" && check.satisfied === true), true);
  });

  it("should evaluate config patch verification contract with fresh-profile checks", () => {
    const plan = derivePatchPlan({
      passed: false,
      primaryDiagnosis: {
        fingerprint: "config:default-enabled-disabled",
        feature: "config",
        featureLabel: "默认配置修正",
        candidateFiles: ["config/addon.config.json"],
      },
    });

    const verification = evaluatePatchVerificationContract({
      patchPlan: plan,
      patchApplication: {
        attempted: true,
        appliedFiles: ["config/addon.config.json"],
      },
      latestReport: {
        primaryDiagnosis: {
          fingerprint: "menu-action:primary-action-failed",
        },
        cycles: [{
          checks: {
            enabled: true,
            primaryActionResult: true,
            agentActionResult: true,
          },
        }],
      },
      recovered: false,
    });

    assert.equal(verification.status, "verification-passed");
    assert.equal(verification.checks.some((check) => check.id === "plugin-enabled" && check.satisfied === true), true);
    assert.equal(verification.checks.some((check) => check.id === "primary-action-result" && check.satisfied === true), true);
    assert.equal(verification.checks.some((check) => check.id === "agent-action-result" && check.satisfied === true), true);
  });
});
