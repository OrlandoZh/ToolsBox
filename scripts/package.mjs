import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  BUILD_MODULE_ID_MODE_ANONYMIZED,
  BUILD_MODULE_ID_MODE_ENV,
  BUILD_PREFERENCE_BINDING_MODE_BRIDGE,
  BUILD_PREFERENCE_BINDING_MODE_ENV,
  BUILD_SEMANTIC_SCRUB_ENV,
  BUILD_SEMANTIC_SCRUB_PROTECTED,
  BUILD_STATIC_SURFACE_MODE_ENV,
  BUILD_STATIC_SURFACE_MODE_SCRUB,
} from "./build.mjs";
import { withBuildLock } from "./build-lock.mjs";
import {
  assertNonEmptyString,
  buildScriptFailureInfo,
  createScriptError,
  isExecutedAsScript,
  readJSONFile,
  SCRIPT_ERROR_CATEGORY_LABELS,
} from "./script-runtime-lib.mjs";
import {
  buildPackageProtectionAuditAnchors,
} from "./package-protection-anchor-audit.mjs";
import {
  applyPackageProtectionJSConfuserTransform,
  ensureJSConfuserToolReady,
  resolveJSConfuserToolSelection,
  resolveJSConfuserPreflightProfile,
} from "./package-protection-jsconfuser-preflight.mjs";
import {
  createCapabilityManifestDescriptorOverlay,
  ENCRYPTED_PACKAGE_VARIANT,
  SHIELDED_PACKAGE_VARIANT,
  SHIELDED_DESCRIPTOR_BIND_PACKAGE_VARIANT,
  SHIELDED_JSCONFUSER_STRING_PACKAGE_VARIANT,
  SHIELDED_PREF_BRIDGE_PACKAGE_VARIANT,
  SHIELDED_SURFACE_SCRUB_PACKAGE_VARIANT,
  SHIELDED_SURFACE_SCRUB_WASM_DIGEST_PACKAGE_VARIANT,
  SHIELDED_SURFACE_SCRUB_WASM_STAGE2_DERIVE_PACKAGE_VARIANT,
  protectBuildBundle,
} from "./package-protection-lib.mjs";
import {
  obfuscateBuildBundle,
  SHIELDED_BUNDLE_OBFUSCATION_STAGE,
  SHIELDED_LOADER_OBFUSCATION_STAGE,
} from "./package-obfuscation-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();
const PACKAGE_JSCONFUSER_TOOL_PATH_ENV = "CLEANROOM_PACKAGE_JSCONFUSER_TOOL_PATH";
const PACKAGE_JSCONFUSER_TOOL_ENTRY_ENV = "CLEANROOM_PACKAGE_JSCONFUSER_TOOL_ENTRY";

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

export function parsePackageArgs(argv = process.argv.slice(2)) {
  const options = {
    encryptBundle: false,
    descriptorBind: false,
    jsConfuserString: false,
    jsConfuserToolEntry: null,
    jsConfuserToolPath: null,
    prefBridge: false,
    surfaceScrub: false,
    surfaceScrubWasmDigest: false,
    surfaceScrubWasmStage2Derive: false,
    shieldBundle: false,
    outputSuffix: "",
    writeReleaseMetadata: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "").trim();
    if (!token) {
      continue;
    }

    switch (token) {
      case "--encrypt-bundle":
        options.encryptBundle = true;
        break;
      case "--shield-bundle":
        options.shieldBundle = true;
        options.encryptBundle = true;
        break;
      case "--descriptor-bind":
        options.descriptorBind = true;
        options.shieldBundle = true;
        options.encryptBundle = true;
        break;
      case "--jsconfuser-string":
        options.jsConfuserString = true;
        options.shieldBundle = true;
        options.encryptBundle = true;
        break;
      case "--pref-bridge":
        options.prefBridge = true;
        options.shieldBundle = true;
        options.encryptBundle = true;
        break;
      case "--surface-scrub":
        options.surfaceScrub = true;
        options.prefBridge = true;
        options.shieldBundle = true;
        options.encryptBundle = true;
        break;
      case "--surface-scrub-wasm-digest":
        options.surfaceScrubWasmDigest = true;
        options.surfaceScrub = true;
        options.prefBridge = true;
        options.shieldBundle = true;
        options.encryptBundle = true;
        break;
      case "--surface-scrub-wasm-stage2-derive":
        options.surfaceScrubWasmStage2Derive = true;
        options.surfaceScrub = true;
        options.prefBridge = true;
        options.shieldBundle = true;
        options.encryptBundle = true;
        break;
      case "--jsconfuser-tool-path":
        options.jsConfuserToolPath = String(argv[index + 1] || "").trim() || null;
        index += 1;
        break;
      case "--jsconfuser-tool-entry":
        options.jsConfuserToolEntry = String(argv[index + 1] || "").trim() || null;
        index += 1;
        break;
      case "--skip-release-metadata":
        options.writeReleaseMetadata = false;
        break;
      case "--write-release-metadata":
        options.writeReleaseMetadata = true;
        break;
      case "--output-suffix": {
        const rawSuffix = String(argv[index + 1] || "").trim();
        if (!rawSuffix) {
          throw createScriptError("args", "--output-suffix requires a non-empty value", {
            failedStage: "parse-args",
            details: { option: "--output-suffix" },
          });
        }
        if (!/^[a-z0-9-]+$/u.test(rawSuffix)) {
          throw createScriptError("args", "--output-suffix must match /^[a-z0-9-]+$/", {
            failedStage: "parse-args",
            details: {
              option: "--output-suffix",
              received: rawSuffix,
            },
          });
        }
        options.outputSuffix = rawSuffix;
        index += 1;
        break;
      }
      default:
        throw createScriptError("args", `Unknown option: ${token}`, {
          failedStage: "parse-args",
          details: { option: token },
        });
    }
  }

  if (options.descriptorBind && options.jsConfuserString) {
    throw createScriptError("args", "--descriptor-bind cannot be combined with --jsconfuser-string", {
      failedStage: "parse-args",
      details: {
        descriptorBind: true,
        jsConfuserString: true,
      },
    });
  }

  if (options.prefBridge && options.descriptorBind) {
    throw createScriptError("args", "--pref-bridge cannot be combined with --descriptor-bind", {
      failedStage: "parse-args",
      details: {
        prefBridge: true,
        descriptorBind: true,
      },
    });
  }

  if (options.prefBridge && options.jsConfuserString) {
    throw createScriptError("args", "--pref-bridge cannot be combined with --jsconfuser-string", {
      failedStage: "parse-args",
      details: {
        prefBridge: true,
        jsConfuserString: true,
      },
    });
  }

  if (!options.jsConfuserString && (options.jsConfuserToolPath || options.jsConfuserToolEntry)) {
    throw createScriptError("args", "--jsconfuser-tool-path/--jsconfuser-tool-entry require --jsconfuser-string", {
      failedStage: "parse-args",
      details: {
        jsConfuserToolPath: options.jsConfuserToolPath,
        jsConfuserToolEntry: options.jsConfuserToolEntry,
      },
    });
  }

  if (options.shieldBundle && !options.outputSuffix) {
    options.outputSuffix = options.descriptorBind
      ? SHIELDED_DESCRIPTOR_BIND_PACKAGE_VARIANT
      : options.surfaceScrubWasmStage2Derive
        ? SHIELDED_SURFACE_SCRUB_WASM_STAGE2_DERIVE_PACKAGE_VARIANT
      : options.surfaceScrubWasmDigest
        ? SHIELDED_SURFACE_SCRUB_WASM_DIGEST_PACKAGE_VARIANT
        : options.surfaceScrub
          ? SHIELDED_SURFACE_SCRUB_PACKAGE_VARIANT
          : options.prefBridge
            ? SHIELDED_PREF_BRIDGE_PACKAGE_VARIANT
            : options.jsConfuserString
              ? SHIELDED_JSCONFUSER_STRING_PACKAGE_VARIANT
              : SHIELDED_PACKAGE_VARIANT;
  }

  if (!options.outputSuffix && options.encryptBundle) {
    options.outputSuffix = ENCRYPTED_PACKAGE_VARIANT;
  }

  if (options.outputSuffix && options.writeReleaseMetadata) {
    throw createScriptError(
      "args",
      "custom package variants must use --skip-release-metadata because release metadata only tracks the standard XPI",
      {
        failedStage: "parse-args",
        details: {
          outputSuffix: options.outputSuffix,
        },
      },
    );
  }

  return options;
}

export function resolvePackageProtectedVariant(options = {}) {
  if (options.descriptorBind) {
    return SHIELDED_DESCRIPTOR_BIND_PACKAGE_VARIANT;
  }
  if (options.surfaceScrubWasmStage2Derive) {
    return SHIELDED_SURFACE_SCRUB_WASM_STAGE2_DERIVE_PACKAGE_VARIANT;
  }
  if (options.surfaceScrubWasmDigest) {
    return SHIELDED_SURFACE_SCRUB_WASM_DIGEST_PACKAGE_VARIANT;
  }
  if (options.surfaceScrub) {
    return SHIELDED_SURFACE_SCRUB_PACKAGE_VARIANT;
  }
  if (options.prefBridge) {
    return SHIELDED_PREF_BRIDGE_PACKAGE_VARIANT;
  }
  if (options.jsConfuserString) {
    return SHIELDED_JSCONFUSER_STRING_PACKAGE_VARIANT;
  }
  if (options.shieldBundle) {
    return SHIELDED_PACKAGE_VARIANT;
  }
  return ENCRYPTED_PACKAGE_VARIANT;
}

function buildOutputName(config, options = {}) {
  const suffix = String(options.outputSuffix || "").trim();
  return suffix
    ? `${config.addonRef}-${config.addonVersion}-${suffix}.xpi`
    : `${config.addonRef}-${config.addonVersion}.xpi`;
}

export function resolvePackageBuildEnv(options = {}) {
  if (options.encryptBundle || options.shieldBundle || options.outputSuffix) {
    const env = {
      [BUILD_MODULE_ID_MODE_ENV]: BUILD_MODULE_ID_MODE_ANONYMIZED,
      [BUILD_SEMANTIC_SCRUB_ENV]: BUILD_SEMANTIC_SCRUB_PROTECTED,
    };
    if (options.prefBridge) {
      env[BUILD_PREFERENCE_BINDING_MODE_ENV] = BUILD_PREFERENCE_BINDING_MODE_BRIDGE;
    }
    if (options.surfaceScrub) {
      env[BUILD_STATIC_SURFACE_MODE_ENV] = BUILD_STATIC_SURFACE_MODE_SCRUB;
    }
    return env;
  }

  return {};
}

export function resolvePackageZipExcludePatterns(options = {}) {
  if (options.encryptBundle || options.shieldBundle || options.outputSuffix) {
    return ["build-report.json"];
  }

  return [];
}

export function buildPackageZipArgs(outputPath, options = {}) {
  const args = ["-r", outputPath, "."];
  const excludePatterns = resolvePackageZipExcludePatterns(options);
  if (excludePatterns.length > 0) {
    args.push("-x", ...excludePatterns);
  }
  return args;
}

export function runNodeScript(scriptPath, failedStage, options = {}) {
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
      ...(options.env && typeof options.env === "object" ? options.env : {}),
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

export function resolvePackageJSConfuserToolOptions(options = {}, env = process.env) {
  const toolPath = String(
    options.jsConfuserToolPath
    || env[PACKAGE_JSCONFUSER_TOOL_PATH_ENV]
    || "",
  ).trim() || null;
  const toolEntry = String(
    options.jsConfuserToolEntry
    || env[PACKAGE_JSCONFUSER_TOOL_ENTRY_ENV]
    || "",
  ).trim() || null;

  return {
    toolPath,
    toolEntry,
  };
}

export async function main(argv = process.argv.slice(2)) {
  await withBuildLock("package.mjs", async () => {
    const options = parsePackageArgs(argv);
    const config = await readPackageConfig();
    const buildRoot = path.join(projectRoot, "build", config.addonRef);
    const bundlePath = path.join(buildRoot, "content", "scripts", `${config.addonRef}.js`);
    const distRoot = path.join(projectRoot, "dist");

    runNodeScript(
      path.join(projectRoot, "scripts", "build.mjs"),
      "run-build",
      { env: resolvePackageBuildEnv(options) },
    );
    const { promises: fs } = await import("node:fs");
    await fs.mkdir(distRoot, { recursive: true });

    let protectedBundleMeta = null;
    let obfuscatedBundleMeta = null;
    let obfuscatedLoaderMeta = null;
    let jsConfuserTransformMeta = null;
    const descriptorOverlay = options.descriptorBind || options.surfaceScrubWasmStage2Derive
      ? createCapabilityManifestDescriptorOverlay({ config })
      : null;
    if (options.jsConfuserString) {
      const jsConfuserTool = resolvePackageJSConfuserToolOptions(options);
      const toolSelection = await resolveJSConfuserToolSelection({
        toolPath: jsConfuserTool.toolPath,
        toolEntry: jsConfuserTool.toolEntry,
        projectRootPath: projectRoot,
      });
      const toolInfo = await ensureJSConfuserToolReady(toolSelection.toolPath, toolSelection.toolEntry);
      const anchors = buildPackageProtectionAuditAnchors({
        addonRef: config.addonRef,
        addonVersion: config.addonVersion,
      });
      const profile = resolveJSConfuserPreflightProfile({
        profile: "targeted-string-concealing",
      }, anchors);
      jsConfuserTransformMeta = await applyPackageProtectionJSConfuserTransform({
        toolInfo,
        bundlePath,
        profile,
      });
      if (!jsConfuserTransformMeta.succeeded || !jsConfuserTransformMeta.syntaxCheckPassed) {
        throw createScriptError("execution", "js-confuser targeted string transform failed", {
          failedStage: "apply-jsconfuser-transform",
          details: {
            toolPath: toolInfo.toolPath,
            toolEntry: toolInfo.entryRelativePath,
            exitCode: jsConfuserTransformMeta.exitCode,
            stderr: jsConfuserTransformMeta.stderr,
            syntaxCheckStderr: jsConfuserTransformMeta.syntaxCheckStderr,
          },
        });
      }
    }
    if (options.shieldBundle) {
      obfuscatedBundleMeta = await obfuscateBuildBundle({
        bundlePath,
        stage: SHIELDED_BUNDLE_OBFUSCATION_STAGE,
      });
    }

    if (options.encryptBundle) {
      protectedBundleMeta = await protectBuildBundle({
        bundlePath,
        addonRef: config.addonRef,
        addonVersion: config.addonVersion,
        variant: resolvePackageProtectedVariant(options),
        descriptorOverlay,
      });
    }

    if (options.shieldBundle) {
      obfuscatedLoaderMeta = await obfuscateBuildBundle({
        bundlePath,
        stage: SHIELDED_LOADER_OBFUSCATION_STAGE,
      });
    }

    const outputName = buildOutputName(config, options);
    const outputPath = path.join(distRoot, outputName);
    await fs.rm(outputPath, { force: true });

    const zip = spawnSync("zip", buildPackageZipArgs(outputPath, options), {
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

    if (options.writeReleaseMetadata) {
      runNodeScript(path.join(projectRoot, "scripts", "release-metadata.mjs"), "run-release-metadata");
    }

    console.log(`Package complete: ${outputPath}`);
    if (obfuscatedBundleMeta) {
      console.log(
        `Bundle obfuscation applied: variant=${obfuscatedBundleMeta.variant} stage=${obfuscatedBundleMeta.stage} sourceSHA256=${obfuscatedBundleMeta.sourceSHA256} obfuscatedSHA256=${obfuscatedBundleMeta.obfuscatedSHA256}`,
      );
    }
    if (protectedBundleMeta) {
      console.log(
        `Protected bundle applied: variant=${protectedBundleMeta.variant} sourceSHA256=${protectedBundleMeta.sourceSHA256}`,
      );
    }
    if (jsConfuserTransformMeta) {
      console.log(
        `JS-Confuser transform applied: variant=${resolvePackageProtectedVariant(options)} apiShape=${jsConfuserTransformMeta.apiShape} growthRatio=${jsConfuserTransformMeta.growthRatio ?? "-"} outputBytes=${jsConfuserTransformMeta.outputBytes}`,
      );
    }
    if (obfuscatedLoaderMeta) {
      console.log(
        `Protected loader obfuscation applied: variant=${obfuscatedLoaderMeta.variant} stage=${obfuscatedLoaderMeta.stage} sourceSHA256=${obfuscatedLoaderMeta.sourceSHA256} obfuscatedSHA256=${obfuscatedLoaderMeta.obfuscatedSHA256}`,
      );
    }
    if (!options.writeReleaseMetadata) {
      console.log("Release metadata skipped for this package variant.");
    }
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
