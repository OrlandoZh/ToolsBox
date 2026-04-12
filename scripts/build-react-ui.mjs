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

function resolveArtifactInputPaths(bundle, projectRoot, buildRoot) {
  const artifacts = Array.isArray(bundle?.build?.artifacts) ? bundle.build.artifacts : [];
  return artifacts.map((artifact) => ({
    ...artifact,
    entryPath: path.join(projectRoot, artifact.entry),
    stylesheetPath: path.join(projectRoot, artifact.stylesheet),
    shellPath: artifact.shell ? path.join(projectRoot, artifact.shell) : null,
    scriptPath: toPathFromBuildRoot(buildRoot, artifact.outputScript),
    stylePath: toPathFromBuildRoot(buildRoot, artifact.outputStyle),
  }));
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
      artifacts: [],
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

  const buildRoot = options.buildRoot || path.join(projectRoot, "build", config.addonRef);
  const artifactInputs = resolveArtifactInputPaths(bundle, projectRoot, buildRoot);

  for (const artifact of artifactInputs) {
    await assertFileExists(artifact.entryPath, `React UI entry (${artifact.id})`);
    await assertFileExists(artifact.stylesheetPath, `React UI stylesheet (${artifact.id})`);
    if (artifact.shellPath) {
      await assertFileExists(artifact.shellPath, `React UI shell (${artifact.id})`);
    }
  }

  const { esbuild } = await loadReactUIBuildDependencies(options);

  try {
    for (const artifact of artifactInputs) {
      await ensureDir(path.dirname(artifact.scriptPath));
      await ensureDir(path.dirname(artifact.stylePath));
    }
  } catch (error) {
    throw wrapScriptError(error, {
      failedStage: "prepare-react-ui-build-root",
      details: {
        buildRoot,
        artifacts: artifactInputs.map((artifact) => ({
          id: artifact.id,
          scriptPath: artifact.scriptPath,
          stylePath: artifact.stylePath,
        })),
      },
    });
  }

  const builtArtifacts = [];
  for (const artifact of artifactInputs) {
    try {
      await esbuild.build({
        entryPoints: [artifact.entryPath],
        outfile: artifact.scriptPath,
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
          artifactId: artifact.id,
          entryPath: artifact.entryPath,
          scriptPath: artifact.scriptPath,
        },
      });
    }

    try {
      if (typeof options.copyStyle === "function") {
        await options.copyStyle(artifact.stylesheetPath, artifact.stylePath, artifact);
      } else {
        await fs.copyFile(artifact.stylesheetPath, artifact.stylePath);
      }
    } catch (error) {
      throw wrapScriptError(error, {
        failedStage: "copy-react-ui-stylesheet",
        details: {
          artifactId: artifact.id,
          stylesheetPath: artifact.stylesheetPath,
          stylePath: artifact.stylePath,
        },
      });
    }

    builtArtifacts.push({
      artifactId: artifact.id,
      kind: artifact.kind,
      summary: artifact.summary,
      globalKey: artifact.globalKey || null,
      scriptPath: artifact.scriptPath,
      stylePath: artifact.stylePath,
      shellPath: artifact.shellPath,
    });
  }

  return {
    bundleId: bundle.id,
    enabled: true,
    lane: bundle.lane,
    implementationStatus: bundle.implementationStatus,
    status: "built",
    buildRoot,
    artifacts: builtArtifacts,
    scriptPath: builtArtifacts[0]?.scriptPath || null,
    stylePath: builtArtifacts[0]?.stylePath || null,
  };
}

export async function main() {
  const result = await buildReactUI();
  if (result.status === "skipped") {
    console.log("React UI build skipped: bundle disabled");
    return;
  }
  result.artifacts.forEach((artifact) => {
    console.log(`React UI artifact built [${artifact.artifactId}/${artifact.kind}]: ${artifact.scriptPath}`);
    console.log(`React UI stylesheet complete [${artifact.artifactId}]: ${artifact.stylePath}`);
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
