import { describe, it, assert } from "./test-framework.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildAttemptStatus,
  buildLightweightDiscoveryRoots,
  buildLightweightCompatPatchedSource,
  buildLightweightLeakSummary,
  discoverLightweightToolPath,
  detectLightweightHostileDefaults,
  hasKnownLightweightCompatPatch,
  parsePackageProtectionLightweightPreflightArgs,
  resolvePackageProtectionLightweightToolSelection,
  summarizePackageProtectionLightweightPreflight,
} from "../scripts/package-protection-lightweight-preflight.mjs";

function writeRunnableLightweightCandidate(toolRoot, version = "0.0.0-test") {
  fs.mkdirSync(path.join(toolRoot, "node_modules"), { recursive: true });
  fs.writeFileSync(path.join(toolRoot, "package.json"), `${JSON.stringify({
    name: "lightweight-js-obfuscator",
    version,
  }, null, 2)}\n`, "utf-8");
  fs.writeFileSync(
    path.join(toolRoot, "obfuscator.js"),
    "console.log('lightweight-js-obfuscator test');\n",
    "utf-8",
  );
}

describe("Package Protection Lightweight Preflight", () => {
  it("should parse required tool path and optional flags", () => {
    const options = parsePackageProtectionLightweightPreflightArgs([
      "--tool-path",
      "/tmp/lightweight-js-obfuscator",
      "--bundle-path",
      "build/cleanroomtemplate/content/scripts/cleanroomtemplate.js",
      "--skip-known-compat-patch",
    ]);

    assert.equal(options.toolPath, "/tmp/lightweight-js-obfuscator");
    assert.equal(options.bundlePath, "build/cleanroomtemplate/content/scripts/cleanroomtemplate.js");
    assert.equal(options.skipKnownCompatPatch, true);
  });

  it("should allow auto-discovery when tool path is omitted", () => {
    const options = parsePackageProtectionLightweightPreflightArgs([]);
    assert.equal(options.toolPath, null);
    assert.equal(options.bundlePath, null);
    assert.equal(options.skipKnownCompatPatch, false);
  });

  it("should build discovery roots that prioritize workspace neighbors before temp fallbacks", () => {
    const roots = buildLightweightDiscoveryRoots({
      projectRootPath: "/tmp/workspace/repo",
      env: {
        HOME: "/tmp/home",
        TMPDIR: "/tmp/custom-temp",
      },
    });

    assert.ok(roots.includes(path.resolve("/tmp/workspace/repo/dist/package-protection-tools/lightweight-js-obfuscator")));
    assert.ok(
      roots.indexOf(path.resolve("/tmp/workspace")) < roots.indexOf(path.resolve("/tmp/home/.openclaw/workspace-coding")),
    );
    assert.ok(
      roots.indexOf(path.resolve("/tmp/home/.openclaw/workspace-coding/projects/GitHub")) < roots.indexOf(path.resolve("/tmp/custom-temp")),
    );
  });

  it("should discover a local lightweight-js-obfuscator checkout from common roots", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lightweight-discovery-"));
    const checkoutRoot = path.join(root, ".openclaw", "workspace-coding", "projects", "GitHub", "lightweight-js-obfuscator");
    writeRunnableLightweightCandidate(checkoutRoot);

    const discovered = await discoverLightweightToolPath({
      projectRootPath: path.join(root, "workspace", "repo"),
      env: {
        HOME: root,
      },
    });

    assert.equal(discovered.toolPath, path.resolve(checkoutRoot));
    assert.equal(discovered.discovered, true);
  });

  it("should resolve lightweight tool selection from auto-discovery when no explicit path is provided", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lightweight-selection-"));
    const checkoutRoot = path.join(root, "Downloads", "lightweight-js-obfuscator");
    writeRunnableLightweightCandidate(checkoutRoot);

    const selected = await resolvePackageProtectionLightweightToolSelection({
      projectRootPath: path.join(root, "workspace", "repo"),
      env: {
        HOME: root,
      },
    });

    assert.equal(selected.toolPath, path.resolve(checkoutRoot));
    assert.equal(selected.discovered, true);
  });

  it("should prefer explicit tool path over discovery", async () => {
    const selected = await resolvePackageProtectionLightweightToolSelection({
      toolPath: "/tmp/manual-lightweight-js-obfuscator",
      projectRootPath: "/tmp/workspace/repo",
      env: {},
    });

    assert.equal(selected.toolPath, "/tmp/manual-lightweight-js-obfuscator");
    assert.equal(selected.discovered, false);
  });

  it("should detect hostile runtime defaults from upstream source", () => {
    const defaults = detectLightweightHostileDefaults(`
      const finalResult = JavaScriptObfuscator.obfuscate(code, {
        selfDefending: true,
        debugProtection: true,
        debugProtectionInterval: 4000,
        disableConsoleOutput: true,
      });
    `);

    assert.deepEqual(defaults, {
      selfDefending: true,
      debugProtection: true,
      debugProtectionInterval: 4000,
      disableConsoleOutput: true,
    });
  });

  it("should inject the known object-property compat patch once", () => {
    const source = `
      function ShouldSkip(path) {
        if (!path || !path.node) return true;
        if (!path.isStringLiteral()) return false;
        return false;
      }
    `;

    const patched = buildLightweightCompatPatchedSource(source);
    assert.equal(patched.applied, true);
    assert.ok(patched.patchedSource.includes("path.parentPath.isObjectProperty()"));

    const idempotent = buildLightweightCompatPatchedSource(patched.patchedSource);
    assert.equal(idempotent.applied, false);
  });

  it("should summarize marker leakage from output source", () => {
    const leakSummary = buildLightweightLeakSummary(
      'const foo = "cleanroomtemplate"; const bar = "generatedAt";',
      ["cleanroomtemplate", "0.1.0", "generatedAt", "optionalBundles"],
    );

    assert.equal(leakSummary.leakFree, false);
    assert.deepEqual(leakSummary.presentMarkers, ["cleanroomtemplate", "generatedAt"]);
  });

  it("should detect when a lightweight checkout already contains the known compat patch", () => {
    assert.equal(hasKnownLightweightCompatPatch("path.parentPath.isObjectProperty()"), true);
    assert.equal(hasKnownLightweightCompatPatch("const noop = true;"), false);
  });

  it("should mark oversized successful output as attention when growth exceeds the threshold", () => {
    const status = buildAttemptStatus({
      succeeded: true,
      appliedCompatPatch: false,
      inputBytes: 100,
      outputBytes: 450,
    });

    assert.equal(status, "attention");
  });

  it("should mark successful output as attention when semantic markers still leak", () => {
    const status = buildAttemptStatus({
      succeeded: true,
      appliedCompatPatch: false,
      inputBytes: 100,
      outputBytes: 150,
      leakFree: false,
    });

    assert.equal(status, "attention");
  });

  it("should classify patched upstream success with hostile defaults as attention", () => {
    const report = summarizePackageProtectionLightweightPreflight({
      toolInfo: {
        toolPath: "/tmp/lightweight-js-obfuscator",
        packageJSON: {
          name: "lightweight-js-obfuscator",
          version: "1.0.0",
        },
        hostileDefaults: {
          selfDefending: true,
          debugProtection: true,
          debugProtectionInterval: 4000,
          disableConsoleOutput: true,
        },
      },
      inputBytes: 652155,
      bundlePath: "/tmp/input.js",
      rawAttempt: {
        succeeded: false,
        status: "failed",
        knownCompatError: "object-property-key",
      },
      compatAttempt: {
        succeeded: true,
        status: "attention",
        appliedCompatPatch: true,
        patchId: "object-property-key-skip",
        output: {
          bytes: 4977170,
          leakSummary: {
            leakFree: true,
            presentMarkers: [],
          },
        },
      },
    });

    assert.equal(report.status, "attention");
    assert.equal(report.nextAction, "prepare-local-wrapper");
    assert.ok(report.summary.includes("direct upstream"));
    assert.equal(report.tool.hasHostileDefaults, true);
  });

  it("should surface when the current tool checkout is already compat patched", () => {
    const report = summarizePackageProtectionLightweightPreflight({
      toolInfo: {
        toolPath: "/tmp/lightweight-js-obfuscator",
        sourceAlreadyCompatPatched: true,
        packageJSON: {
          name: "lightweight-js-obfuscator",
          version: "1.0.0",
        },
        hostileDefaults: {
          selfDefending: true,
          debugProtection: true,
          debugProtectionInterval: 4000,
          disableConsoleOutput: true,
        },
      },
      inputBytes: 652155,
      bundlePath: "/tmp/input.js",
      rawAttempt: {
        succeeded: true,
        status: "passed",
      },
      compatAttempt: {
        succeeded: true,
        status: "passed",
      },
    });

    assert.equal(report.status, "attention");
    assert.ok(report.summary.includes("已带本地 compat patch"));
    assert.equal(report.tool.sourceAlreadyCompatPatched, true);
  });
});
