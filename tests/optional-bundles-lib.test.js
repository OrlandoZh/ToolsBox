import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  getOptionalBundle,
  inspectOptionalBundleContracts,
  isOptionalBundleEnabled,
  loadOptionalBundleRegistry,
  normalizeOptionalBundleRegistry,
} from "../scripts/optional-bundles-lib.mjs";

const projectRoot = path.resolve(".");

describe("Optional Bundles Lib", () => {
  it("should load the checked-in optional bundle registry with stable lanes", () => {
    const { registry } = loadOptionalBundleRegistry(projectRoot);

    assert.equal(registry.schemaVersion, 1);
    assert.ok(registry.bundles.some((entry) => entry.id === "react-ui"));
    assert.ok(registry.bundles.some((entry) => entry.id === "agent-runtime"));
    assert.ok(registry.bundles.some((entry) => entry.id === "ai-service"));
    assert.equal(getOptionalBundle(registry, "react-ui")?.lane, "ts-isolated");
    assert.equal(getOptionalBundle(registry, "react-ui")?.implementationStatus, "implemented");
    assert.deepEqual(getOptionalBundle(registry, "react-ui")?.build?.requiredPackages, [
      "esbuild",
      "react",
      "react-dom",
    ]);
    assert.equal(getOptionalBundle(registry, "react-ui")?.build?.artifacts?.length, 2);
    assert.equal(getOptionalBundle(registry, "react-ui")?.build?.artifacts?.[0]?.kind, "window-shell");
    assert.equal(getOptionalBundle(registry, "react-ui")?.build?.artifacts?.[1]?.kind, "surface-bridge");
    assert.equal(isOptionalBundleEnabled(registry, "react-ui"), false);
  });

  it("should reject invalid optional bundle registries", () => {
    assert.throws(() => normalizeOptionalBundleRegistry({
      schemaVersion: 1,
      summary: "broken",
      bundles: [
        {
          id: "broken",
          enabled: false,
          lane: "unknown",
          implementationStatus: "implemented",
          summary: "broken",
          build: {
            scriptName: "build:broken",
            requiredPackages: ["react"],
            artifacts: [
              {
                id: "default",
                kind: "window-shell",
                summary: "broken",
                entry: "src/broken.tsx",
                stylesheet: "src/broken.css",
                shell: "addon-static/broken.xhtml",
                outputScript: "content/scripts/broken.js",
                outputStyle: "content/styles/broken.css",
              },
            ],
          },
        },
      ],
    }));
  });

  it("should keep optional bundle contracts valid for the current template", () => {
    const report = inspectOptionalBundleContracts(projectRoot);

    assert.equal(report.ok, true);
    assert.deepEqual(report.issues, []);
  });
});
