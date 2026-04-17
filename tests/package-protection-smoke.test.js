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
});
