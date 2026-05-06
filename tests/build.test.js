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
  WASM_KERNEL_PROBE_PATH,
  WASM_KERNEL_PROBE_WORKER_PATH,
} from "../src/utils/optional-bundle-paths.js";
import {
  BUILD_INCLUDE_DEV_SURFACES_ENV,
  BUILD_MODULE_ID_MODE_ANONYMIZED,
  BUILD_MODULE_ID_MODE_PATH,
  BUILD_PREFERENCE_BINDING_MODE_BRIDGE,
  BUILD_PREFERENCE_BINDING_MODE_NATIVE,
  BUILD_PREFERENCE_BINDING_MODE_ENV,
  BUILD_SEMANTIC_SCRUB_NONE,
  BUILD_SEMANTIC_SCRUB_PROTECTED,
  BUILD_STATIC_SURFACE_MODE_ENV,
  BUILD_STATIC_SURFACE_MODE_SCRUB,
  BUILD_STATIC_SURFACE_MODE_STANDARD,
  DEV_ONLY_STATIC_SURFACE_PATHS,
  DEV_ONLY_SOURCE_MODULE_PATHS,
  PACKAGE_EXCLUDED_OPTIONAL_BUNDLE_IDS,
  createBuildConfigExpression,
  createBundleModuleId,
  resolveBuildIncludeDevSurfaces,
  resolveBuildModuleIdMode,
  resolveBuildPreferenceBindingMode,
  resolveBuildSemanticScrubMode,
  resolveBuildStaticSurfaceMode,
  scrubProtectedSourceLiterals,
  stripProtectedSourceComments,
} from "../scripts/build.mjs";
import { createSurfaceDescriptors as createProtectedSurfaceDescriptors } from "../src/app/surface-descriptors-protected.js";

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

  it("should resolve build preference binding mode from environment safely", () => {
    assert.equal(resolveBuildPreferenceBindingMode({}), BUILD_PREFERENCE_BINDING_MODE_NATIVE);
    assert.equal(
      resolveBuildPreferenceBindingMode({ [BUILD_PREFERENCE_BINDING_MODE_ENV]: "bridge" }),
      BUILD_PREFERENCE_BINDING_MODE_BRIDGE,
    );
    assert.equal(
      resolveBuildPreferenceBindingMode({ [BUILD_PREFERENCE_BINDING_MODE_ENV]: "unexpected" }),
      BUILD_PREFERENCE_BINDING_MODE_NATIVE,
    );
  });

  it("should resolve build static surface mode from environment safely", () => {
    assert.equal(resolveBuildStaticSurfaceMode({}), BUILD_STATIC_SURFACE_MODE_STANDARD);
    assert.equal(
      resolveBuildStaticSurfaceMode({ [BUILD_STATIC_SURFACE_MODE_ENV]: "scrub" }),
      BUILD_STATIC_SURFACE_MODE_SCRUB,
    );
    assert.equal(
      resolveBuildStaticSurfaceMode({ [BUILD_STATIC_SURFACE_MODE_ENV]: "unexpected" }),
      BUILD_STATIC_SURFACE_MODE_STANDARD,
    );
  });

  it("should resolve dev surface inclusion from environment safely", () => {
    assert.equal(resolveBuildIncludeDevSurfaces({}), true);
    assert.equal(resolveBuildIncludeDevSurfaces({ [BUILD_INCLUDE_DEV_SURFACES_ENV]: "0" }), false);
    assert.equal(resolveBuildIncludeDevSurfaces({ [BUILD_INCLUDE_DEV_SURFACES_ENV]: "1" }), true);
    assert.equal(resolveBuildIncludeDevSurfaces({ [BUILD_INCLUDE_DEV_SURFACES_ENV]: "unexpected" }), true);
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

  it("should strip standalone comments from protected bundle source without touching code lines", () => {
    const source = [
      "/**",
      " * Reader 摘要",
      " */",
      "import { demo } from \"./demo.js\";",
      "",
      "  // host action hint",
      "const value = demo();",
      "const url = \"https://example.com/reader-summary\";",
    ].join("\n");

    const stripped = stripProtectedSourceComments(source);

    assert.equal(stripped.includes("Reader 摘要"), false);
    assert.equal(stripped.includes("host action hint"), false);
    assert.equal(stripped.includes("import { demo } from \"./demo.js\";"), true);
    assert.equal(stripped.includes("const value = demo();"), true);
    assert.equal(stripped.includes("https://example.com/reader-summary"), true);
  });

  it("should encode protected build config strings without changing runtime values", () => {
    const config = {
      addonRef: "cleanroomtemplate",
      addonName: "Zotero Cleanroom Template",
      addonVersion: "0.1.0",
      updateURL: "https://example.com/downloads/cleanroomtemplate/update.json",
      defaultPrefs: {
        enabled: true,
        menuLabel: "",
      },
      optional: ["agent-runtime", "ai-service"],
    };

    const standardExpression = createBuildConfigExpression(config);
    const protectedExpression = createBuildConfigExpression(config, BUILD_SEMANTIC_SCRUB_PROTECTED);
    const decoded = Function(`return ${protectedExpression};`)();

    assert.equal(standardExpression.includes("cleanroomtemplate"), true);
    assert.equal(protectedExpression.includes("cleanroomtemplate"), false);
    assert.equal(protectedExpression.includes("Zotero Cleanroom Template"), false);
    assert.equal(protectedExpression.includes("agent-runtime"), false);
    assert.deepEqual(decoded, config);
  });

  it("should scrub protected-only diagnostic literals from selected source files", () => {
    const readerSource = [
      'debug("reader.openReader.success", {});',
      'error("reader.openByURI.failed", {});',
    ].join("\n");
    const mainSource = 'const event = "cleanroom.bootstrap.startup.failed";';
    const wasmLoaderSource = 'throw new Error("WebAssembly.instantiate is required");';

    const scrubbedReader = scrubProtectedSourceLiterals(
      readerSource,
      path.join(projectRoot, "src", "features", "reader.js"),
      path.join(projectRoot, "src"),
    );
    const scrubbedMain = scrubProtectedSourceLiterals(
      mainSource,
      path.join(projectRoot, "src", "main.js"),
      path.join(projectRoot, "src"),
    );
    const scrubbedWasmLoader = scrubProtectedSourceLiterals(
      wasmLoaderSource,
      path.join(projectRoot, "src", "services", "wasm-loader.js"),
      path.join(projectRoot, "src"),
    );

    assert.equal(scrubbedReader.includes("reader.open"), false);
    assert.equal(scrubbedReader.includes("reader.r0.success"), true);
    assert.equal(scrubbedReader.includes("reader.r1.failed"), true);
    assert.equal(scrubbedMain.includes("cleanroom.bootstrap"), false);
    assert.equal(scrubbedMain.includes("tool.bootstrap.startup.failed"), true);
    assert.equal(scrubbedWasmLoader.includes("WebAssembly.instantiate"), false);
    assert.equal(scrubbedWasmLoader.includes("wasm instantiate unavailable"), true);
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
    const wasmKernelBundle = Array.isArray(report.optionalBundles)
      ? report.optionalBundles.find((entry) => entry.bundleId === "wasm-kernel")
      : null;

    assert.equal(reactUIBundle?.status, "skipped");
    assert.equal(reactUIBundle?.reason, "disabled");
    assert.equal(wasmKernelBundle?.status, "planned");
    assert.equal(wasmKernelBundle?.reason, "not-implemented");
    assert.equal(wasmKernelBundle?.enabled, false);
    assert.equal(wasmKernelBundle?.lane, "js-core");
    assert.equal(report.moduleIdMode, "path");
    assert.equal(report.semanticScrubMode, "none");
    assert.equal(report.staticSurfaceMode, "standard");
    assert.equal(report.devSurfacesIncluded, true);
    assert.deepEqual(report.excludedDevSurfacePaths, []);
    assert.equal(report.devRuntimeModulesIncluded, true);
    assert.deepEqual(report.excludedDevRuntimeModulePaths, []);
    for (const relativePath of DEV_ONLY_STATIC_SURFACE_PATHS) {
      assert.equal(fs.existsSync(path.join(projectRoot, "build", config.addonRef, ...relativePath.split("/"))), true);
    }
    assert.equal(
      fs.existsSync(path.join(projectRoot, "build", config.addonRef, ...WASM_KERNEL_PROBE_PATH.split("/"))),
      true,
    );
    assert.equal(
      fs.existsSync(path.join(projectRoot, "build", config.addonRef, ...WASM_KERNEL_PROBE_WORKER_PATH.split("/"))),
      true,
    );
  });

  it("should exclude dev-only surfaces and platform metadata in package build mode", () => {
    execFileSync("node", ["scripts/build.mjs"], {
      cwd: projectRoot,
      stdio: "pipe",
      env: {
        ...process.env,
        [BUILD_INCLUDE_DEV_SURFACES_ENV]: "0",
      },
    });

    const config = readJSON(path.join(projectRoot, "config", "addon.config.json"));
    const buildRoot = path.join(projectRoot, "build", config.addonRef);
    const report = readJSON(path.join(buildRoot, "build-report.json"));
    const packageBundleIds = report.optionalBundles.map((entry) => entry.bundleId);

    assert.equal(report.devSurfacesIncluded, false);
    assert.deepEqual(report.excludedDevSurfacePaths, DEV_ONLY_STATIC_SURFACE_PATHS);
    assert.equal(report.devRuntimeModulesIncluded, false);
    assert.deepEqual(report.excludedDevRuntimeModulePaths, DEV_ONLY_SOURCE_MODULE_PATHS);
    for (const bundleId of PACKAGE_EXCLUDED_OPTIONAL_BUNDLE_IDS) {
      assert.equal(packageBundleIds.includes(bundleId), false);
    }
    for (const relativePath of DEV_ONLY_STATIC_SURFACE_PATHS) {
      assert.equal(fs.existsSync(path.join(buildRoot, ...relativePath.split("/"))), false);
    }
    const bundleSource = fs.readFileSync(path.join(buildRoot, "content", "scripts", `${config.addonRef}.js`), "utf-8");
    assert.equal(bundleSource.includes("content/lib/agent-review-workbench.xhtml"), false);
    assert.equal(bundleSource.includes("createReviewWorkbenchStateStore"), false);
    assert.equal(bundleSource.includes("AGENT_REVIEW_WORKBENCH_WINDOW_CLEANUP_KEY"), false);
    assert.equal(bundleSource.includes("REVIEW_WORKBENCH_SCOPE_SNAPSHOT"), false);
    assert.equal(bundleSource.includes("Runtime compact review workbench provider is available."), false);
    assert.equal(bundleSource.includes("BASELINE_ITEM_PANE_L10N"), false);
    assert.equal(bundleSource.includes("Host Action catalog returns source-driven descriptors"), false);
    assert.equal(bundleSource.includes("runtime.probeWasmKernel"), false);
    assert.equal(bundleSource.includes("Open Preference Pane"), false);
    assert.equal(bundleSource.includes("Dev-only runtime is excluded from packaged runtime."), true);
    assert.equal(bundleSource.includes("agent-runtime"), false);
    assert.equal(bundleSource.includes("ai-service"), false);
    assert.equal(fs.existsSync(path.join(buildRoot, ".DS_Store")), false);
    assert.equal(fs.existsSync(path.join(buildRoot, "locale", ".DS_Store")), false);
    assert.equal(fs.existsSync(path.join(buildRoot, "content", ".DS_Store")), false);
    assert.equal(fs.existsSync(path.join(buildRoot, "content", "locale", ".DS_Store")), false);
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
    const preferencesXHTMLPath = path.join(projectRoot, "build", config.addonRef, "content", "preferences.xhtml");
    const preferencesXHTML = fs.readFileSync(preferencesXHTMLPath, "utf-8");
    const preferencesScriptPath = path.join(projectRoot, "build", config.addonRef, "content", "preferences.js");
    const preferencesScript = fs.readFileSync(preferencesScriptPath, "utf-8");
    const themeScriptPath = path.join(projectRoot, "build", config.addonRef, "content", "theme.js");
    const themeScript = fs.readFileSync(themeScriptPath, "utf-8");
    const preferenceBridgeScriptPath = path.join(projectRoot, "build", config.addonRef, "content", "preference-pane-load-bridge.js");
    const preferenceBridgeScript = fs.readFileSync(preferenceBridgeScriptPath, "utf-8");
    const report = readJSON(
      path.join(projectRoot, "build", config.addonRef, "build-report.json"),
    );
    const protectedDescriptors = createProtectedSurfaceDescriptors(config);

    assert.equal(report.moduleIdMode, "anonymized");
    assert.equal(report.semanticScrubMode, "protected");
    assert.equal(bundleSource.includes(config.addonName), false);
    assert.equal(bundleSource.includes(config.addonVersion), false);
    assert.equal(bundleSource.includes(config.author), false);
    assert.equal(bundleSource.includes(config.homepage), false);
    assert.equal(bundleSource.includes(config.updateURL), false);
    assert.equal(bundleSource.includes(config.prefsPrefix), false);
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
    assert.equal(bundleSource.includes("基线注册"), false);
    assert.equal(bundleSource.includes("条目展示摘要"), false);
    assert.equal(bundleSource.includes("通知器联动"), false);
    assert.equal(bundleSource.includes("Reader 摘要"), false);
    assert.equal(bundleSource.includes("Reader 批注回环"), false);
    assert.equal(bundleSource.includes("Reader UI 状态"), false);
    assert.equal(bundleSource.includes("Reader 事件桥"), false);
    assert.equal(bundleSource.includes("无阻塞动作执行"), false);
    assert.equal(bundleSource.includes("宿主动作编排"), false);
    assert.equal(bundleSource.includes("设置治理"), false);
    assert.equal(bundleSource.includes("多窗口挂载"), false);
    assert.equal(bundleSource.includes("运行时桥接报告"), false);
    assert.equal(bundleSource.includes("preferences.openPane"), false);
    assert.equal(bundleSource.includes("runtime.probeWasmKernel"), false);
    assert.equal(bundleSource.includes("runtime.deriveWasmKernelDigest"), false);
    assert.equal(bundleSource.includes("runtime.deriveWasmKernelUnlockToken"), false);
    assert.equal(bundleSource.includes("window.openReactDemo"), false);
    assert.equal(bundleSource.includes("reader.open"), false);
    assert.equal(bundleSource.includes("cleanroom.bootstrap"), false);
    assert.equal(bundleSource.includes("WebAssembly.instantiate"), false);
    assert.equal(bundleSource.includes("Open Preference Pane"), false);
    assert.equal(bundleSource.includes("authoritativeSource"), false);
    assert.equal(bundleSource.includes("readinessAssertions"), false);
    assert.equal(enUSLocaleSource.includes("Open Cleanroom Action"), false);
    assert.equal(enUSLocaleSource.includes("Show Reader Demo Summary"), false);
    assert.equal(enUSLocaleSource.includes("Cleanroom Template Preferences"), false);
    assert.equal(enUSLocaleSource.includes("Cleanroom Summary"), false);
    assert.equal(enUSLocaleSource.includes("Cleanroom Demo"), false);
    assert.equal(preferencesXHTML.includes("cleanroomtemplate-preferences-root"), false);
    assert.equal(preferencesXHTML.includes("__PREFERENCE_ROOT_ID__"), false);
    assert.equal(preferencesXHTML.includes(protectedDescriptors.preferenceRootID), true);
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

  it("should patch preference names to opaque placeholders in bridge binding mode", () => {
    execFileSync("node", ["scripts/build.mjs"], {
      cwd: projectRoot,
      stdio: "pipe",
      env: {
        ...process.env,
        CLEANROOM_BUILD_MODULE_ID_MODE: "anonymized",
        CLEANROOM_BUILD_SEMANTIC_SCRUB: "protected",
        CLEANROOM_BUILD_PREFERENCE_BINDING_MODE: "bridge",
      },
    });

    const config = readJSON(path.join(projectRoot, "config", "addon.config.json"));
    const preferencesXHTMLPath = path.join(projectRoot, "build", config.addonRef, "content", "preferences.xhtml");
    const prefsJSPath = path.join(projectRoot, "build", config.addonRef, "prefs.js");
    const preferencesXHTML = fs.readFileSync(preferencesXHTMLPath, "utf-8");
    const prefsJS = fs.readFileSync(prefsJSPath, "utf-8");
    const protectedDescriptors = createProtectedSurfaceDescriptors(config);
    const orderedPreferenceKeys = Array.from(new Set([
      "enabled",
      "menuLabel",
      "logLevel",
      "themeMode",
      ...Object.keys(config.defaultPrefs || {}),
    ]));

    assert.equal(preferencesXHTML.includes(config.prefsPrefix), false);
    assert.equal(preferencesXHTML.includes(`${config.prefsPrefix}.enabled`), false);
    assert.equal(preferencesXHTML.includes(`${config.prefsPrefix}.themeMode`), false);
    assert.equal(prefsJS.includes(config.prefsPrefix), false);
    assert.equal(prefsJS.includes(`${config.prefsPrefix}.enabled`), false);
    assert.equal(prefsJS.includes(`${config.prefsPrefix}.themeMode`), false);
    assert.equal(/__PREF_[A-Z0-9_]+_NAME__/u.test(preferencesXHTML), false);
    assert.equal(/__PREF_[A-Z0-9_]+_NAME__/u.test(prefsJS), false);

    for (const [index, key] of orderedPreferenceKeys.entries()) {
      const placeholderName = `extensions.zotero.${protectedDescriptors.preferencePaneID}.p${index}`;
      assert.equal(preferencesXHTML.includes(placeholderName), true);
      assert.equal(prefsJS.includes(placeholderName), true);
      assert.equal(preferencesXHTML.includes(`${config.prefsPrefix}.${key}`), false);
      assert.equal(prefsJS.includes(`${config.prefsPrefix}.${key}`), false);
    }
  });

  it("should scrub bootstrap literals in static surface scrub mode", () => {
    execFileSync("node", ["scripts/build.mjs"], {
      cwd: projectRoot,
      stdio: "pipe",
      env: {
        ...process.env,
        CLEANROOM_BUILD_MODULE_ID_MODE: "anonymized",
        CLEANROOM_BUILD_SEMANTIC_SCRUB: "protected",
        CLEANROOM_BUILD_PREFERENCE_BINDING_MODE: "bridge",
        CLEANROOM_BUILD_STATIC_SURFACE_MODE: "scrub",
      },
    });

    const config = readJSON(path.join(projectRoot, "config", "addon.config.json"));
    const bootstrapPath = path.join(projectRoot, "build", config.addonRef, "bootstrap.js");
    const bootstrapSource = fs.readFileSync(bootstrapPath, "utf-8");
    const manifestPath = path.join(projectRoot, "build", config.addonRef, "manifest.json");
    const manifest = readJSON(manifestPath);
    const wasmWorkerPath = path.join(projectRoot, "build", config.addonRef, ...WASM_KERNEL_PROBE_WORKER_PATH.split("/"));
    const wasmWorkerSource = fs.readFileSync(wasmWorkerPath, "utf-8");
    const report = readJSON(
      path.join(projectRoot, "build", config.addonRef, "build-report.json"),
    );

    assert.equal(report.staticSurfaceMode, "scrub");
    assert.equal(manifest.name, "Zotero Tool Package");
    assert.equal(manifest.description, "Protected Zotero add-on package.");
    assert.equal(manifest.author, "Tool Package");
    assert.equal(Object.prototype.hasOwnProperty.call(manifest, "homepage_url"), false);
    assert.equal(manifest.applications.zotero.update_url, config.updateURL);
    assert.equal(bootstrapSource.includes(config.addonRef), false);
    assert.equal(bootstrapSource.includes(config.instanceKey), false);
    assert.equal(bootstrapSource.includes(config.addonName), false);
    assert.equal(bootstrapSource.includes(config.homepage), false);
    assert.equal(bootstrapSource.includes("cleanroom.bootstrap"), false);
    assert.equal(bootstrapSource.includes("console-bridge"), false);
    assert.equal(bootstrapSource.includes("capability-report"), false);
    assert.equal(bootstrapSource.includes('"__ADDON_REF__"'), false);
    assert.equal(bootstrapSource.includes('"__INSTANCE_KEY__"'), false);
    assert.equal(wasmWorkerSource.includes("WebAssembly.instantiate"), false);
    assert.equal(wasmWorkerSource.includes("worker cannot fetch wasm bytes"), false);
  });
});
