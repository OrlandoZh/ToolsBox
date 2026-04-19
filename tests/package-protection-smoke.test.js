import { describe, it, assert } from "./test-framework.js";
import {
  MANUAL_SCORECARD_LEVELS,
  buildProtectionAutomationScorecard,
  parsePackageProtectionSmokeArgs,
  resolvePackageProtectionSmokePackageArgs,
  summarizePackageProtectionSmokeReport,
} from "../scripts/package-protection-smoke.mjs";

describe("Package Protection Smoke", () => {
  it("should parse required args and apply defaults", () => {
    const options = parsePackageProtectionSmokeArgs(["--variant", "shielded"]);

    assert.equal(options.variant, "shielded");
    assert.equal(options.channel, "stable");
    assert.equal(options.repeats, 3);
  });

  it("should accept descriptor-bind as an experimental smoke variant alias", () => {
    const options = parsePackageProtectionSmokeArgs(["--variant", "descriptor-bind"]);

    assert.equal(options.variant, "shielded-descriptor-bind");
    assert.equal(options.channel, "stable");
  });

  it("should parse optional js-confuser tool args for the string experiment variant", () => {
    const options = parsePackageProtectionSmokeArgs([
      "--variant",
      "shielded-jsconfuser-string",
      "--jsconfuser-tool-path",
      "/tmp/js-confuser",
      "--jsconfuser-tool-entry",
      "dist/index.js",
    ]);

    assert.equal(options.variant, "shielded-jsconfuser-string");
    assert.equal(options.jsConfuserToolPath, "/tmp/js-confuser");
    assert.equal(options.jsConfuserToolEntry, "dist/index.js");
  });

  it("should accept pref-bridge as a static-surface experiment variant alias", () => {
    const options = parsePackageProtectionSmokeArgs(["--variant", "pref-bridge"]);

    assert.equal(options.variant, "shielded-pref-bridge");
    assert.equal(options.channel, "stable");
  });

  it("should accept surface-scrub as a static-surface experiment variant alias", () => {
    const options = parsePackageProtectionSmokeArgs(["--variant", "surface-scrub"]);

    assert.equal(options.variant, "shielded-surface-scrub");
    assert.equal(options.channel, "stable");
  });

  it("should accept wasm-digest as a bounded wasm experiment variant alias", () => {
    const options = parsePackageProtectionSmokeArgs(["--variant", "wasm-digest"]);

    assert.equal(options.variant, "shielded-surface-scrub-wasm-digest");
    assert.equal(options.channel, "stable");
  });

  it("should accept wasm-stage2-derive as a protected overlay gate variant alias", () => {
    const options = parsePackageProtectionSmokeArgs(["--variant", "wasm-stage2-derive"]);

    assert.equal(options.variant, "shielded-surface-scrub-wasm-stage2-derive");
    assert.equal(options.channel, "stable");
  });

  it("should reject missing variants and invalid repeat counts", () => {
    assert.throws(() => parsePackageProtectionSmokeArgs([]));
    assert.throws(() => parsePackageProtectionSmokeArgs(["--variant", "plain", "--repeats", "0"]));
    assert.throws(() => parsePackageProtectionSmokeArgs(["--variant", "invalid"]));
  });

  it("should route smoke variants to the expected package args", () => {
    assert.deepEqual(resolvePackageProtectionSmokePackageArgs("plain"), []);
    assert.deepEqual(resolvePackageProtectionSmokePackageArgs("encrypted"), [
      "--encrypt-bundle",
      "--skip-release-metadata",
    ]);
    assert.deepEqual(resolvePackageProtectionSmokePackageArgs("shielded"), [
      "--shield-bundle",
      "--skip-release-metadata",
    ]);
    assert.deepEqual(resolvePackageProtectionSmokePackageArgs("shielded-descriptor-bind"), [
      "--descriptor-bind",
      "--skip-release-metadata",
    ]);
    assert.deepEqual(resolvePackageProtectionSmokePackageArgs("shielded-pref-bridge"), [
      "--pref-bridge",
      "--skip-release-metadata",
    ]);
    assert.deepEqual(resolvePackageProtectionSmokePackageArgs("shielded-surface-scrub"), [
      "--surface-scrub",
      "--skip-release-metadata",
    ]);
    assert.deepEqual(resolvePackageProtectionSmokePackageArgs("shielded-surface-scrub-wasm-digest"), [
      "--surface-scrub-wasm-digest",
      "--skip-release-metadata",
    ]);
    assert.deepEqual(resolvePackageProtectionSmokePackageArgs("shielded-surface-scrub-wasm-stage2-derive"), [
      "--surface-scrub-wasm-stage2-derive",
      "--skip-release-metadata",
    ]);
    assert.deepEqual(resolvePackageProtectionSmokePackageArgs("shielded-jsconfuser-string", {
      jsConfuserToolPath: "/tmp/js-confuser",
      jsConfuserToolEntry: "dist/index.js",
    }), [
      "--jsconfuser-string",
      "--skip-release-metadata",
      "--jsconfuser-tool-path",
      "/tmp/js-confuser",
      "--jsconfuser-tool-entry",
      "dist/index.js",
    ]);
  });

  it("should summarize a fully passing smoke batch as passed", () => {
    const report = summarizePackageProtectionSmokeReport({
      variant: "shielded",
      channel: "stable",
      repeats: 2,
      xpi: {
        path: "/tmp/demo-shielded.xpi",
        sizeBytes: 1234,
      },
      bundle: {
        path: "/tmp/demo.js",
        sizeBytes: 5678,
      },
      automatedScorecard: {
        metadataLeakFree: true,
        leakedMarkers: [],
        contiguousPayloadHidden: true,
        maxBase64LiteralLength: 96,
        plainModuleDefsHidden: true,
        hostileRuntimeOptionsDisabled: true,
        loaderOptions: {
          selfDefending: false,
          debugProtection: false,
          debugProtectionInterval: 0,
          controlFlowFlattening: false,
        },
      },
      runs: [
        {
          passed: true,
          readinessMode: "native",
          hostBinding: {
            available: true,
            dbAvailable: true,
            noncePresent: true,
            nonceSource: "sqlite",
          },
          capabilityManifest: {
            detailLevel: "limited",
            overlayAvailable: false,
            overlayApplied: false,
            activationSatisfied: false,
          },
          packageProtection: {
            decodeMethod: "fromBase64",
            decodeDurationMs: 120,
            prepareDurationMs: 210,
            bootstrapResolveDurationMs: 210,
          },
        },
        {
          passed: true,
          readinessMode: "native",
          hostBinding: {
            available: true,
            dbAvailable: true,
            noncePresent: true,
            nonceSource: "sqlite",
          },
          capabilityManifest: {
            detailLevel: "limited",
            overlayAvailable: false,
            overlayApplied: false,
            activationSatisfied: false,
          },
          packageProtection: {
            decodeMethod: "fromBase64",
            decodeDurationMs: 100,
            prepareDurationMs: 205,
            bootstrapResolveDurationMs: 206,
          },
        },
      ],
    });

    assert.equal(report.status, "passed");
    assert.equal(report.passed, true);
    assert.equal(report.passedRunCount, 2);
    assert.equal(report.failedRunCount, 0);
    assert.equal(report.medianDecodeDurationMs, 110);
    assert.equal(report.decodeMethods.fromBase64, 2);
    assert.equal(report.readinessModes.native, 2);
    assert.equal(report.hostBindingAvailableCount, 2);
    assert.equal(report.hostBindingDBAvailableCount, 2);
    assert.equal(report.hostBindingNoncePresentCount, 2);
    assert.equal(report.hostBindingNonceSources.sqlite, 2);
    assert.equal(report.capabilityManifestDetailLevels.limited, 2);
    assert.equal(report.capabilityManifestOverlayAvailableCount, 0);
    assert.equal(report.automatedScorecard.passed, true);
    assert.deepEqual(report.manualScorecard.allowedRatings, MANUAL_SCORECARD_LEVELS);
  });

  it("should summarize any failing smoke batch as failed", () => {
    const report = summarizePackageProtectionSmokeReport({
      variant: "encrypted",
      channel: "stable",
      repeats: 2,
      xpi: {
        path: "/tmp/demo-encrypted.xpi",
        sizeBytes: 1234,
      },
      bundle: {
        path: "/tmp/demo.js",
        sizeBytes: 4321,
      },
      automatedScorecard: {
        metadataLeakFree: true,
        leakedMarkers: [],
        contiguousPayloadHidden: true,
        maxBase64LiteralLength: 96,
        plainModuleDefsHidden: true,
        hostileRuntimeOptionsDisabled: true,
        loaderOptions: null,
      },
      runs: [
        {
          passed: true,
          readinessMode: "native",
          packageProtection: {
            decodeMethod: "atob",
            decodeDurationMs: 90,
            prepareDurationMs: 190,
            bootstrapResolveDurationMs: 190,
          },
        },
        {
          passed: false,
          readinessMode: "manual",
          packageProtection: {
            decodeMethod: "atob",
            decodeDurationMs: 180,
            prepareDurationMs: 280,
            bootstrapResolveDurationMs: 281,
          },
        },
      ],
    });

    assert.equal(report.status, "failed");
    assert.equal(report.passed, false);
    assert.equal(report.failedRunCount, 1);
    assert.equal(report.readinessModes.manual, 1);
    assert.ok(report.summary.includes("失败 1 次"));
  });

  it("should detect metadata leaks and exposed module tables in the automated scorecard", () => {
    const sourceCode = `
      var addonRef = "demo-addon";
      var addonVersion = "1.2.3";
      var generatedAt = "2026-04-16T00:00:00.000Z";
      var sourceSHA256 = "abc";
      var payload = "${"A".repeat(640)}";
      var __moduleDefs = {};
    `;
    const scorecard = buildProtectionAutomationScorecard({
      sourceCode,
      variant: "shielded",
      config: {
        addonRef: "demo-addon",
        addonVersion: "1.2.3",
      },
    });

    assert.equal(scorecard.metadataLeakFree, false);
    assert.equal(scorecard.contiguousPayloadHidden, false);
    assert.equal(scorecard.plainModuleDefsHidden, false);
    assert.ok(scorecard.leakedMarkers.includes("demo-addon"));
    assert.ok(scorecard.leakedMarkers.includes("1.2.3"));
    assert.equal(scorecard.maxBase64LiteralLength >= 640, true);
  });

  it("should preserve an explicit manual scorecard when summarizing a smoke report", () => {
    const report = summarizePackageProtectionSmokeReport({
      variant: "shielded",
      channel: "stable",
      repeats: 1,
      xpi: {
        path: "/tmp/demo-shielded.xpi",
        sizeBytes: 1234,
      },
      bundle: {
        path: "/tmp/demo.js",
        sizeBytes: 5678,
      },
      automatedScorecard: {
        metadataLeakFree: true,
        leakedMarkers: [],
        contiguousPayloadHidden: true,
        maxBase64LiteralLength: 96,
        plainModuleDefsHidden: true,
        hostileRuntimeOptionsDisabled: true,
        loaderOptions: null,
      },
      manualScorecard: {
        webcrackInitialResult: "parse-fail / only-loader",
        llmSinglePassResult: "high-level-architecture",
        status: "completed",
        completedAt: "2026-04-18T00:00:00.000Z",
      },
      runs: [
        {
          passed: true,
          readinessMode: "native",
          packageProtection: {
            decodeMethod: "fromBase64",
            decodeDurationMs: 100,
            prepareDurationMs: 200,
            bootstrapResolveDurationMs: 200,
          },
        },
      ],
    });

    assert.equal(report.manualScorecard.webcrackInitialResult, "parse-fail / only-loader");
    assert.equal(report.manualScorecard.llmSinglePassResult, "high-level-architecture");
    assert.equal(report.manualScorecard.status, "completed");
    assert.equal(report.manualScorecard.completedAt, "2026-04-18T00:00:00.000Z");
  });
});
