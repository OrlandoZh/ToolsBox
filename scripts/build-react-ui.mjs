import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  getOptionalBundle,
  loadOptionalBundleRegistry,
} from "./optional-bundles-lib.mjs";
import {
  buildScriptFailureInfo,
  createScriptError,
  isExecutedAsScript,
  readJSONFile,
  wrapScriptError,
} from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const configPath = path.join(projectRoot, "config", "addon.config.json");
const scriptStartedAt = Date.now();

function toPathFromBuildRoot(buildRoot, relativePath) {
  return path.join(buildRoot, ...String(relativePath || "").split("/"));
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function assertFileExists(filePath, label) {
  try {
    await fs.access(filePath);
  } catch (error) {
    throw createScriptError("environment", `Missing ${label}: ${filePath}`, {
      failedStage: "resolve-react-ui-input",
      details: {
        filePath,
        label,
      },
      cause: error,
    });
  }
}

async function loadReactUIBuildDependencies(options = {}) {
  if (typeof options.loadDependencies === "function") {
    return await options.loadDependencies();
  }

  try {
    const [esbuildModule] = await Promise.all([
      import("esbuild"),
      import("react"),
      import("react-dom/client"),
    ]);

    return {
      esbuild: esbuildModule,
    };
  } catch (error) {
    throw wrapScriptError(error, {
      category: "environment",
      failedStage: "load-react-ui-build-deps",
      message: "Optional bundle `react-ui` is enabled but React build dependencies are missing. Install `esbuild`, `react`, and `react-dom`, or disable the bundle in config/optional-bundles.json.",
    });
  }
}

export async function buildReactUI(options = {}) {
  const config = options.config || await readJSONFile(configPath, {
    missingCategory: "environment",
    invalidCategory: "validation",
    missingStage: "read-config",
    invalidStage: "read-config",
    label: "config/addon.config.json",
  });

  const registry = options.registry || loadOptionalBundleRegistry(projectRoot).registry;
  const bundle = getOptionalBundle(registry, "react-ui");
  if (!bundle) {
    throw createScriptError("validation", "Optional bundle `react-ui` is not declared in config/optional-bundles.json.", {
      failedStage: "resolve-react-ui-bundle",
    });
  }

  if (!bundle.enabled) {
    return {
      bundleId: bundle.id,
      enabled: false,
      lane: bundle.lane,
      implementationStatus: bundle.implementationStatus,
      status: "skipped",
      reason: "disabled",
    };
  }

  if (bundle.implementationStatus !== "implemented" || !bundle.build) {
    throw createScriptError("validation", "Optional bundle `react-ui` must be implemented before it can be built.", {
      failedStage: "resolve-react-ui-bundle",
      details: {
        implementationStatus: bundle.implementationStatus,
      },
    });
  }

  const entryPath = path.join(projectRoot, bundle.build.entry);
  const stylesheetPath = path.join(projectRoot, bundle.build.stylesheet);
  const shellPath = path.join(projectRoot, bundle.build.shell);
  const buildRoot = options.buildRoot || path.join(projectRoot, "build", config.addonRef);
  const scriptPath = toPathFromBuildRoot(buildRoot, bundle.build.outputScript);
  const stylePath = toPathFromBuildRoot(buildRoot, bundle.build.outputStyle);

  await assertFileExists(entryPath, "React UI entry");
  await assertFileExists(stylesheetPath, "React UI stylesheet");
  await assertFileExists(shellPath, "React UI shell");

  const { esbuild } = await loadReactUIBuildDependencies(options);

  try {
    await ensureDir(path.dirname(scriptPath));
    await ensureDir(path.dirname(stylePath));
  } catch (error) {
    throw wrapScriptError(error, {
      failedStage: "prepare-react-ui-build-root",
      details: {
        buildRoot,
        scriptPath,
        stylePath,
      },
    });
  }

  try {
    await esbuild.build({
      entryPoints: [entryPath],
      outfile: scriptPath,
      bundle: true,
      format: "iife",
      platform: "browser",
      target: ["firefox115"],
      jsx: "automatic",
      sourcemap: false,
      minify: false,
      legalComments: "none",
      define: {
        "process.env.NODE_ENV": JSON.stringify("production"),
      },
    });
  } catch (error) {
    throw wrapScriptError(error, {
      failedStage: "bundle-react-ui-entry",
      details: {
        entryPath,
        scriptPath,
      },
    });
  }

  try {
    if (typeof options.copyStyle === "function") {
      await options.copyStyle(stylesheetPath, stylePath);
    } else {
      await fs.copyFile(stylesheetPath, stylePath);
    }
  } catch (error) {
    throw wrapScriptError(error, {
      failedStage: "copy-react-ui-stylesheet",
      details: {
        stylesheetPath,
        stylePath,
      },
    });
  }

  return {
    bundleId: bundle.id,
    enabled: true,
    lane: bundle.lane,
    implementationStatus: bundle.implementationStatus,
    status: "built",
    buildRoot,
    scriptPath,
    stylePath,
  };
}

export async function main() {
  const result = await buildReactUI();
  if (result.status === "skipped") {
    console.log("React UI build skipped: bundle disabled");
    return;
  }
  console.log(`React UI build complete: ${result.scriptPath}`);
  console.log(`React UI stylesheet complete: ${result.stylePath}`);
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
