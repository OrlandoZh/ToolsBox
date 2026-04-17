/**
 * 构建产物测试
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it, assert } from "./test-framework.js";
import {
  BUILD_MODULE_ID_MODE_ANONYMIZED,
  BUILD_MODULE_ID_MODE_PATH,
  BUILD_SEMANTIC_SCRUB_NONE,
  BUILD_SEMANTIC_SCRUB_PROTECTED,
  createBundleModuleId,
  resolveBuildModuleIdMode,
  resolveBuildSemanticScrubMode,
} from "../scripts/build.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

describe("Build Artifacts", () => {
  it("should resolve build module id mode from environment safely", () => {
    assert.equal(resolveBuildModuleIdMode({}), BUILD_MODULE_ID_MODE_PATH);
    assert.equal(
      resolveBuildModuleIdMode({ CLEANROOM_BUILD_MODULE_ID_MODE: "anonymized" }),
      BUILD_MODULE_ID_MODE_ANONYMIZED,
    );
    assert.equal(
      resolveBuildModuleIdMode({ CLEANROOM_BUILD_MODULE_ID_MODE: "unexpected" }),
      BUILD_MODULE_ID_MODE_PATH,
    );
  });

  it("should resolve build semantic scrub mode from environment safely", () => {
    assert.equal(resolveBuildSemanticScrubMode({}), BUILD_SEMANTIC_SCRUB_NONE);
    assert.equal(
      resolveBuildSemanticScrubMode({ CLEANROOM_BUILD_SEMANTIC_SCRUB: "protected" }),
      BUILD_SEMANTIC_SCRUB_PROTECTED,
    );
    assert.equal(
      resolveBuildSemanticScrubMode({ CLEANROOM_BUILD_SEMANTIC_SCRUB: "unexpected" }),
      BUILD_SEMANTIC_SCRUB_NONE,
    );
  });

  it("should anonymize bundle module ids only in protected build mode", () => {
    const srcRootPath = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate-build-mode-"));
    const mainFile = path.join(srcRootPath, "app", "main.js");
    const loggerFile = path.join(srcRootPath, "core", "logger.js");

    fs.mkdirSync(path.dirname(mainFile), { recursive: true });
    fs.mkdirSync(path.dirname(loggerFile), { recursive: true });
    fs.writeFileSync(mainFile, "export function main() {}", "utf-8");
    fs.writeFileSync(loggerFile, "export function logger() {}", "utf-8");

    try {
      const defaultMainId = createBundleModuleId(mainFile, srcRootPath, BUILD_MODULE_ID_MODE_PATH);
      const defaultLoggerId = createBundleModuleId(loggerFile, srcRootPath, BUILD_MODULE_ID_MODE_PATH);
      const anonymizedMainId = createBundleModuleId(mainFile, srcRootPath, BUILD_MODULE_ID_MODE_ANONYMIZED);
      const anonymizedLoggerId = createBundleModuleId(loggerFile, srcRootPath, BUILD_MODULE_ID_MODE_ANONYMIZED);

      assert.equal(defaultMainId, "app/main.js");
      assert.equal(defaultLoggerId, "core/logger.js");
      assert.equal(anonymizedMainId.startsWith("m_"), true);
      assert.equal(anonymizedLoggerId.startsWith("m_"), true);
      assert.equal(anonymizedMainId.includes("main.js"), false);
      assert.equal(anonymizedLoggerId.includes("logger.js"), false);
      assert.equal(anonymizedMainId === anonymizedLoggerId, false);
    } finally {
      fs.rmSync(srcRootPath, { recursive: true, force: true });
    }
  });

  it("should generate manifest with non-empty zotero update_url", () => {
    execFileSync("node", ["scripts/build.mjs"], {
      cwd: projectRoot,
      stdio: "pipe",
    });

    const config = readJSON(path.join(projectRoot, "config", "addon.config.json"));
    const manifest = readJSON(
      path.join(projectRoot, "build", config.addonRef, "manifest.json"),
    );

    assert.equal(
      manifest.applications.zotero.update_url,
      config.updateURL,
    );
    assert.ok(typeof manifest.applications.zotero.update_url === "string");
    assert.ok(manifest.applications.zotero.update_url.length > 0);

    const report = readJSON(
      path.join(projectRoot, "build", config.addonRef, "build-report.json"),
    );
    const reactUIBundle = Array.isArray(report.optionalBundles)
      ? report.optionalBundles.find((entry) => entry.bundleId === "react-ui")
      : null;

    assert.equal(reactUIBundle?.status, "skipped");
    assert.equal(reactUIBundle?.reason, "disabled");
    assert.equal(report.moduleIdMode, "path");
    assert.equal(report.semanticScrubMode, "none");
  });

  it("should build a protected source proxy with semantic anchors reduced", () => {
    execFileSync("node", ["scripts/build.mjs"], {
      cwd: projectRoot,
      stdio: "pipe",
      env: {
        ...process.env,
        CLEANROOM_BUILD_MODULE_ID_MODE: "anonymized",
        CLEANROOM_BUILD_SEMANTIC_SCRUB: "protected",
      },
    });

    const config = readJSON(path.join(projectRoot, "config", "addon.config.json"));
    const bundlePath = path.join(
      projectRoot,
      "build",
      config.addonRef,
      "content",
      "scripts",
      `${config.addonRef}.js`,
    );
    const bundleSource = fs.readFileSync(bundlePath, "utf-8");
    const enUSLocalePath = path.join(projectRoot, "build", config.addonRef, "locale", "en-US", "main.ftl");
    const enUSLocaleSource = fs.readFileSync(enUSLocalePath, "utf-8");
    const reactDemoShellPath = path.join(projectRoot, "build", config.addonRef, "content", "react-ui", "demo.xhtml");
    const reactDemoShell = fs.readFileSync(reactDemoShellPath, "utf-8");
    const preferencesScriptPath = path.join(projectRoot, "build", config.addonRef, "content", "preferences.js");
    const preferencesScript = fs.readFileSync(preferencesScriptPath, "utf-8");
    const themeScriptPath = path.join(projectRoot, "build", config.addonRef, "content", "theme.js");
    const themeScript = fs.readFileSync(themeScriptPath, "utf-8");
    const preferenceBridgeScriptPath = path.join(projectRoot, "build", config.addonRef, "content", "preference-pane-load-bridge.js");
    const preferenceBridgeScript = fs.readFileSync(preferenceBridgeScriptPath, "utf-8");
    const report = readJSON(
      path.join(projectRoot, "build", config.addonRef, "build-report.json"),
    );

    assert.equal(report.moduleIdMode, "anonymized");
    assert.equal(report.semanticScrubMode, "protected");
    assert.equal(bundleSource.includes("plugin.api.agent."), false);
    assert.equal(bundleSource.includes("entrypoints"), false);
    assert.equal(bundleSource.includes("ownedBy"), false);
    assert.equal(bundleSource.includes("successSignals"), false);
    assert.equal(bundleSource.includes("agent-runtime"), false);
    assert.equal(bundleSource.includes("ai-service"), false);
    assert.equal(bundleSource.includes("cleanroom-template-menuitem"), false);
    assert.equal(bundleSource.includes("cleanroom-template-style"), false);
    assert.equal(bundleSource.includes(`${config.addonRef}-preferences`), false);
    assert.equal(bundleSource.includes(`${config.addonRef}-reader-selection-snapshot`), false);
    assert.equal(bundleSource.includes(`${config.addonRef}-context-action`), false);
    assert.equal(bundleSource.includes(`${config.addonRef}-selection-summary`), false);
    assert.equal(bundleSource.includes(`${config.addonRef}.runtime-core`), false);
    assert.equal(bundleSource.includes(`${config.addonRef}.host-signals`), false);
    assert.equal(bundleSource.includes("Open Cleanroom Action"), false);
    assert.equal(bundleSource.includes("Show Reader Demo Summary"), false);
    assert.equal(bundleSource.includes("Show Reader Selection Snapshot"), false);
    assert.equal(bundleSource.includes("Baseline demos ready"), false);
    assert.equal(bundleSource.includes("No notifier event yet."), false);
    assert.equal(bundleSource.includes("Optional React UI Demo"), false);
    assert.equal(bundleSource.includes("Optional React Host Surface"), false);
    assert.equal(bundleSource.includes("Runtime Core"), false);
    assert.equal(bundleSource.includes("Host Signal Collector"), false);
    assert.equal(bundleSource.includes("Host Nonce Store"), false);
    assert.equal(bundleSource.includes("Runtime Bridge"), false);
    assert.equal(enUSLocaleSource.includes("Open Cleanroom Action"), false);
    assert.equal(enUSLocaleSource.includes("Show Reader Demo Summary"), false);
    assert.equal(enUSLocaleSource.includes("Cleanroom Template Preferences"), false);
    assert.equal(enUSLocaleSource.includes("Cleanroom Summary"), false);
    assert.equal(enUSLocaleSource.includes("Cleanroom Demo"), false);
    assert.equal(reactDemoShell.includes("React UI Demo"), false);
    assert.equal(reactDemoShell.includes("React UI demo requires JavaScript."), false);
    assert.equal(preferencesScript.includes("bootstrapCleanroomPreferencesController"), false);
    assert.equal(preferencesScript.includes("__CLEANROOM_THEME_CONTRACT__"), false);
    assert.equal(preferencesScript.includes("__CLEANROOM_PREFERENCE_BRIDGE__"), false);
    assert.equal(preferencesScript.includes("initCleanroomPreferences"), false);
    assert.equal(themeScript.includes("bootstrapCleanroomThemeContract"), false);
    assert.equal(themeScript.includes("__CLEANROOM_THEME_CONTRACT__"), false);
    assert.equal(preferenceBridgeScript.includes("bootstrapCleanroomPreferencePaneLoadBridge"), false);
    assert.equal(preferenceBridgeScript.includes("__CLEANROOM_PREFERENCE_PANE_LOAD_API__"), false);
    assert.equal(preferenceBridgeScript.includes("__CLEANROOM_PREFERENCE_PANE_LOAD_BRIDGE_STATE__"), false);
  });
});
