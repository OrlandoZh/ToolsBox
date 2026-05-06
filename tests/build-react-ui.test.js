import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import { buildReactUI } from "../scripts/build-react-ui.mjs";
import { loadOptionalBundleRegistry } from "../scripts/optional-bundles-lib.mjs";
import {
  REACT_UI_SURFACE_BRIDGE_SCRIPT_PATH,
} from "../src/utils/optional-bundle-paths.js";

const projectRoot = path.resolve(".");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function resolveBuildPath(buildRoot, relativePath) {
  return path.join(buildRoot, ...relativePath.split("/"));
}

function makeConfig() {
  return {
    addonRef: "cleanroomtemplate",
    addonName: "Cleanroom Template",
  };
}

describe("Build React UI", () => {
  it("should skip the react-ui lane when the optional bundle is disabled", async () => {
    const { registry } = loadOptionalBundleRegistry(projectRoot);
    const buildRoot = fs.mkdtempSync(path.join(os.tmpdir(), "react-ui-build-skip-"));

    try {
      const result = await buildReactUI({
        config: makeConfig(),
        buildRoot,
        registry,
      });

      assert.equal(result.status, "skipped");
      assert.equal(result.reason, "disabled");
      assert.deepEqual(result.artifacts, []);
      assert.equal(fs.existsSync(resolveBuildPath(buildRoot, REACT_UI_SURFACE_BRIDGE_SCRIPT_PATH)), false);
    } finally {
      fs.rmSync(buildRoot, { recursive: true, force: true });
    }
  });

  it("should build react-ui artifacts with injected build dependencies", async () => {
    const { registry } = loadOptionalBundleRegistry(projectRoot);
    const enabledRegistry = clone(registry);
    enabledRegistry.bundles = enabledRegistry.bundles.map((bundle) => (
      bundle.id === "react-ui"
        ? {
            ...bundle,
            enabled: true,
          }
        : bundle
    ));

    const buildRoot = fs.mkdtempSync(path.join(os.tmpdir(), "react-ui-build-enabled-"));

    try {
      const result = await buildReactUI({
        config: makeConfig(),
        buildRoot,
        registry: enabledRegistry,
        loadDependencies: async () => ({
          esbuild: {
            async build(options) {
              fs.mkdirSync(path.dirname(options.outfile), { recursive: true });
              fs.writeFileSync(options.outfile, "window.__REACT_UI_SURFACE_BRIDGE__ = true;\n", "utf-8");
            },
          },
        }),
      });

      assert.equal(result.status, "built");
      assert.equal(result.artifacts.length, 1);
      const bridgeArtifact = result.artifacts.find((artifact) => artifact.artifactId === "surface-bridge");

      assert.ok(bridgeArtifact);
      assert.equal(fs.existsSync(bridgeArtifact.scriptPath), true);
      assert.equal(fs.existsSync(bridgeArtifact.stylePath), true);
      assert.ok(fs.readFileSync(bridgeArtifact.scriptPath, "utf-8").includes("__REACT_UI_SURFACE_BRIDGE__"));
      assert.ok(fs.readFileSync(bridgeArtifact.stylePath, "utf-8").includes(".react-surface-bridge-shell"));
    } finally {
      fs.rmSync(buildRoot, { recursive: true, force: true });
    }
  });

  it("should build react-ui artifacts with the installed optional lane dependencies", async () => {
    const { registry } = loadOptionalBundleRegistry(projectRoot);
    const enabledRegistry = clone(registry);
    enabledRegistry.bundles = enabledRegistry.bundles.map((bundle) => (
      bundle.id === "react-ui"
        ? {
            ...bundle,
            enabled: true,
          }
        : bundle
    ));
    const buildRoot = fs.mkdtempSync(path.join(os.tmpdir(), "react-ui-build-real-"));

    try {
      const result = await buildReactUI({
        config: makeConfig(),
        buildRoot,
        registry: enabledRegistry,
      });

      assert.equal(result.status, "built");
      assert.equal(result.artifacts.length, 1);
      const bridgeArtifact = result.artifacts.find((artifact) => artifact.artifactId === "surface-bridge");
      assert.ok(bridgeArtifact);
      assert.ok(fs.readFileSync(bridgeArtifact.scriptPath, "utf-8").includes("__CleanroomTemplateReactSurface__"));
    } finally {
      fs.rmSync(buildRoot, { recursive: true, force: true });
    }
  });
});
