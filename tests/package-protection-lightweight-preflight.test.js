import { describe, it, assert } from "./test-framework.js";
import {
  buildAttemptStatus,
  buildLightweightCompatPatchedSource,
  buildLightweightLeakSummary,
  detectLightweightHostileDefaults,
  hasKnownLightweightCompatPatch,
  parsePackageProtectionLightweightPreflightArgs,
  summarizePackageProtectionLightweightPreflight,
} from "../scripts/package-protection-lightweight-preflight.mjs";

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

  it("should require a tool path", () => {
    assert.throws(() => parsePackageProtectionLightweightPreflightArgs([]));
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
