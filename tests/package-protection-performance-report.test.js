import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import { summarizePackageProtectionSmokeReport } from "../scripts/package-protection-smoke.mjs";
import {
  parsePackageProtectionPerformanceArgs,
  persistPackageProtectionPerformanceReport,
  summarizePackageProtectionPerformanceReport,
} from "../scripts/package-protection-performance-report.mjs";

function buildSmokeReport({
  variant,
  channel = "stable",
  xpiBytes = 200000,
  bundleBytes = 700000,
  runs = [],
} = {}) {
  return summarizePackageProtectionSmokeReport({
    variant,
    channel,
    repeats: runs.length,
    xpi: {
      path: `/tmp/${variant}-${channel}.xpi`,
      sizeBytes: xpiBytes,
    },
    bundle: {
      path: `/tmp/${variant}-${channel}.js`,
      sizeBytes: bundleBytes,
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
    runs: runs.map((run, index) => ({
      runIndex: index + 1,
      passed: true,
      status: "passed",
      statusLabel: "通过",
      readinessMode: "native",
      apiReady: true,
      blockingRuntimeErrorCount: 0,
      hostNoiseErrorCount: 0,
      durationMs: run.durationMs,
      packageProtection: {
        variant,
        decodeMethod: "fromBase64",
        loadSubScriptDurationMs: run.loadSubScriptDurationMs,
        decodeDurationMs: run.decodeDurationMs,
        decryptDurationMs: run.decryptDurationMs,
        evalDurationMs: run.evalDurationMs,
        prepareDurationMs: run.prepareDurationMs,
        bootstrapResolveDurationMs: run.prepareDurationMs,
      },
      issues: [],
    })),
  });
}

describe("Package Protection Performance Report", () => {
  it("should parse defaults and repeated variants", () => {
    const defaults = parsePackageProtectionPerformanceArgs([]);
    assert.equal(defaults.channel, "stable");
    assert.deepEqual(defaults.variants, [
      "plain",
      "encrypted",
      "shielded",
      "shielded-jsconfuser-string",
    ]);

    const explicit = parsePackageProtectionPerformanceArgs([
      "--channel",
      "beta",
      "--variant",
      "shielded",
      "--variant",
      "jsconfuser-string",
    ]);
    assert.equal(explicit.channel, "beta");
    assert.deepEqual(explicit.variants, [
      "shielded",
      "shielded-jsconfuser-string",
    ]);

    const surfaceScrub = parsePackageProtectionPerformanceArgs([
      "--variant",
      "surface-scrub",
    ]);
    assert.deepEqual(surfaceScrub.variants, ["shielded-surface-scrub"]);

    const wasmDigest = parsePackageProtectionPerformanceArgs([
      "--variant",
      "wasm-digest",
    ]);
    assert.deepEqual(wasmDigest.variants, ["shielded-surface-scrub-wasm-digest"]);

    const wasmStage2Derive = parsePackageProtectionPerformanceArgs([
      "--variant",
      "wasm-stage2-derive",
    ]);
    assert.deepEqual(wasmStage2Derive.variants, ["shielded-surface-scrub-wasm-stage2-derive"]);
  });

  it("should classify experimental timing using duration for UX and pipeline for protection cost", () => {
    const plain = buildSmokeReport({
      variant: "plain",
      xpiBytes: 160601,
      bundleBytes: 699794,
      runs: [
        { durationMs: 1000, loadSubScriptDurationMs: 0, decodeDurationMs: 0, decryptDurationMs: 0, evalDurationMs: 0, prepareDurationMs: 0 },
        { durationMs: 1030, loadSubScriptDurationMs: 0, decodeDurationMs: 0, decryptDurationMs: 0, evalDurationMs: 0, prepareDurationMs: 0 },
        { durationMs: 1060, loadSubScriptDurationMs: 0, decodeDurationMs: 0, decryptDurationMs: 0, evalDurationMs: 0, prepareDurationMs: 0 },
      ],
    });
    const encrypted = buildSmokeReport({
      variant: "encrypted",
      xpiBytes: 183000,
      bundleBytes: 745000,
      runs: [
        { durationMs: 1040, loadSubScriptDurationMs: 9, decodeDurationMs: 3, decryptDurationMs: 2, evalDurationMs: 4, prepareDurationMs: 18 },
        { durationMs: 1048, loadSubScriptDurationMs: 10, decodeDurationMs: 3, decryptDurationMs: 2, evalDurationMs: 4, prepareDurationMs: 19 },
        { durationMs: 1056, loadSubScriptDurationMs: 10, decodeDurationMs: 4, decryptDurationMs: 2, evalDurationMs: 5, prepareDurationMs: 20 },
      ],
    });
    const shielded = buildSmokeReport({
      variant: "shielded",
      xpiBytes: 2450000,
      bundleBytes: 3020000,
      runs: [
        { durationMs: 1700, loadSubScriptDurationMs: 420, decodeDurationMs: 24, decryptDurationMs: 14, evalDurationMs: 44, prepareDurationMs: 83 },
        { durationMs: 1728, loadSubScriptDurationMs: 423, decodeDurationMs: 25, decryptDurationMs: 15, evalDurationMs: 45, prepareDurationMs: 84 },
        { durationMs: 1757, loadSubScriptDurationMs: 426, decodeDurationMs: 26, decryptDurationMs: 16, evalDurationMs: 46, prepareDurationMs: 85 },
      ],
    });
    const jsconfuserString = buildSmokeReport({
      variant: "shielded-jsconfuser-string",
      xpiBytes: 3647704,
      bundleBytes: 4993241,
      runs: [
        { durationMs: 1588, loadSubScriptDurationMs: 528, decodeDurationMs: 28, decryptDurationMs: 15, evalDurationMs: 46, prepareDurationMs: 92 },
        { durationMs: 1599, loadSubScriptDurationMs: 529, decodeDurationMs: 29, decryptDurationMs: 15, evalDurationMs: 46, prepareDurationMs: 93 },
        { durationMs: 1610, loadSubScriptDurationMs: 531, decodeDurationMs: 30, decryptDurationMs: 16, evalDurationMs: 47, prepareDurationMs: 94 },
      ],
    });

    const report = summarizePackageProtectionPerformanceReport({
      channel: "stable",
      smokeReports: {
        plain,
        encrypted,
        shielded,
        "shielded-jsconfuser-string": jsconfuserString,
      },
    });

    assert.equal(report.status, "passed");
    assert.equal(report.variants.find((item) => item.variant === "shielded")?.metrics?.protectionPipelineDurationMsMedian, 507);
    assert.equal(report.variants.find((item) => item.variant === "shielded")?.metrics?.protectionPipelineDurationMsP95, 511);
    assert.equal(report.variants.find((item) => item.variant === "shielded")?.metrics?.durationMsP95, 1757);
    const encryptedVsPlain = report.comparisons.find((item) => item.id === "encrypted-vs-plain");
    assert.equal(encryptedVsPlain?.classification, "low-overhead-baseline");
    assert.equal(encryptedVsPlain?.deltas?.duration?.absolute, 18);
    const jsconfuserVsShielded = report.comparisons.find((item) => item.id === "shielded-jsconfuser-string-vs-shielded");
    assert.equal(jsconfuserVsShielded?.classification, "noisy-faster-but-heavier");
    assert.equal(jsconfuserVsShielded?.deltas?.duration?.absolute, -129);
    assert.equal(jsconfuserVsShielded?.deltas?.protectionPipeline?.absolute, 115);
    assert.ok(report.recommendations.includes("do-not-promote-jsconfuser-string-by-duration-alone"));
  });

  it("should persist latest and channel-scoped performance artifacts", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "package-protection-performance-"));
    try {
      const report = summarizePackageProtectionPerformanceReport({
        channel: "stable",
        smokeReports: {
          plain: buildSmokeReport({
            variant: "plain",
            runs: [
              { durationMs: 1000, loadSubScriptDurationMs: 0, decodeDurationMs: 0, decryptDurationMs: 0, evalDurationMs: 0, prepareDurationMs: 0 },
            ],
          }),
        },
      });

      const paths = await persistPackageProtectionPerformanceReport(report, {
        projectRootPath: projectRoot,
      });

      assert.ok(fs.existsSync(paths.reportPath));
      assert.ok(fs.existsSync(paths.reportMDPath));
      assert.ok(fs.existsSync(paths.archiveJSONPath));
      assert.ok(fs.existsSync(paths.archiveMDPath));
      const markdown = fs.readFileSync(paths.reportMDPath, "utf-8");
      assert.ok(markdown.includes("Package Protection Performance"));
      assert.ok(markdown.includes("durationMs median"));
      assert.ok(markdown.includes("durationMs p95/max"));
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("should compare surface-scrub against shielded when surface-scrub smoke is present", () => {
    const shielded = buildSmokeReport({
      variant: "shielded",
      runs: [
        { durationMs: 1700, loadSubScriptDurationMs: 420, decodeDurationMs: 24, decryptDurationMs: 14, evalDurationMs: 44, prepareDurationMs: 84 },
        { durationMs: 1720, loadSubScriptDurationMs: 423, decodeDurationMs: 25, decryptDurationMs: 15, evalDurationMs: 45, prepareDurationMs: 85 },
        { durationMs: 1740, loadSubScriptDurationMs: 426, decodeDurationMs: 26, decryptDurationMs: 16, evalDurationMs: 46, prepareDurationMs: 86 },
      ],
    });
    const surfaceScrub = buildSmokeReport({
      variant: "shielded-surface-scrub",
      runs: [
        { durationMs: 1690, loadSubScriptDurationMs: 418, decodeDurationMs: 24, decryptDurationMs: 14, evalDurationMs: 42, prepareDurationMs: 78 },
        { durationMs: 1705, loadSubScriptDurationMs: 420, decodeDurationMs: 24, decryptDurationMs: 14, evalDurationMs: 43, prepareDurationMs: 79 },
        { durationMs: 1715, loadSubScriptDurationMs: 421, decodeDurationMs: 25, decryptDurationMs: 15, evalDurationMs: 43, prepareDurationMs: 80 },
      ],
    });

    const report = summarizePackageProtectionPerformanceReport({
      channel: "stable",
      variants: ["shielded", "shielded-surface-scrub"],
      smokeReports: {
        shielded,
        "shielded-surface-scrub": surfaceScrub,
      },
    });

    const comparison = report.comparisons.find((item) => item.id === "shielded-surface-scrub-vs-shielded");
    assert.equal(comparison?.classification, "lighter-than-shielded");
    assert.equal(comparison?.deltas?.protectionPipeline?.absolute, -9);
  });

  it("should compare surface-scrub-wasm-digest against surface-scrub when the wasm candidate smoke is present", () => {
    const surfaceScrub = buildSmokeReport({
      variant: "shielded-surface-scrub",
      runs: [
        { durationMs: 1690, loadSubScriptDurationMs: 418, decodeDurationMs: 24, decryptDurationMs: 14, evalDurationMs: 42, prepareDurationMs: 78 },
        { durationMs: 1705, loadSubScriptDurationMs: 420, decodeDurationMs: 24, decryptDurationMs: 14, evalDurationMs: 43, prepareDurationMs: 79 },
        { durationMs: 1715, loadSubScriptDurationMs: 421, decodeDurationMs: 25, decryptDurationMs: 15, evalDurationMs: 43, prepareDurationMs: 80 },
      ],
    });
    const wasmDigest = buildSmokeReport({
      variant: "shielded-surface-scrub-wasm-digest",
      runs: [
        { durationMs: 1694, loadSubScriptDurationMs: 419, decodeDurationMs: 24, decryptDurationMs: 14, evalDurationMs: 42, prepareDurationMs: 79 },
        { durationMs: 1708, loadSubScriptDurationMs: 421, decodeDurationMs: 24, decryptDurationMs: 14, evalDurationMs: 43, prepareDurationMs: 80 },
        { durationMs: 1719, loadSubScriptDurationMs: 422, decodeDurationMs: 25, decryptDurationMs: 15, evalDurationMs: 43, prepareDurationMs: 81 },
      ],
    });

    const report = summarizePackageProtectionPerformanceReport({
      channel: "stable",
      variants: ["shielded-surface-scrub", "shielded-surface-scrub-wasm-digest"],
      smokeReports: {
        "shielded-surface-scrub": surfaceScrub,
        "shielded-surface-scrub-wasm-digest": wasmDigest,
      },
    });

    const comparison = report.comparisons.find((item) => item.id === "shielded-surface-scrub-wasm-digest-vs-shielded-surface-scrub");
    assert.equal(comparison?.baseVariant, "shielded-surface-scrub");
    assert.equal(comparison?.targetVariant, "shielded-surface-scrub-wasm-digest");
  });

  it("should compare surface-scrub-wasm-stage2-derive against surface-scrub when the stage2 candidate smoke is present", () => {
    const surfaceScrub = buildSmokeReport({
      variant: "shielded-surface-scrub",
      runs: [
        { durationMs: 1690, loadSubScriptDurationMs: 418, decodeDurationMs: 24, decryptDurationMs: 14, evalDurationMs: 42, prepareDurationMs: 78 },
        { durationMs: 1705, loadSubScriptDurationMs: 420, decodeDurationMs: 24, decryptDurationMs: 14, evalDurationMs: 43, prepareDurationMs: 79 },
        { durationMs: 1715, loadSubScriptDurationMs: 421, decodeDurationMs: 25, decryptDurationMs: 15, evalDurationMs: 43, prepareDurationMs: 80 },
      ],
    });
    const wasmStage2Derive = buildSmokeReport({
      variant: "shielded-surface-scrub-wasm-stage2-derive",
      runs: [
        { durationMs: 1696, loadSubScriptDurationMs: 419, decodeDurationMs: 24, decryptDurationMs: 14, evalDurationMs: 42, prepareDurationMs: 80 },
        { durationMs: 1710, loadSubScriptDurationMs: 421, decodeDurationMs: 24, decryptDurationMs: 14, evalDurationMs: 43, prepareDurationMs: 81 },
        { durationMs: 1720, loadSubScriptDurationMs: 422, decodeDurationMs: 25, decryptDurationMs: 15, evalDurationMs: 43, prepareDurationMs: 82 },
      ],
    });

    const report = summarizePackageProtectionPerformanceReport({
      channel: "stable",
      variants: ["shielded-surface-scrub", "shielded-surface-scrub-wasm-stage2-derive"],
      smokeReports: {
        "shielded-surface-scrub": surfaceScrub,
        "shielded-surface-scrub-wasm-stage2-derive": wasmStage2Derive,
      },
    });

    const comparison = report.comparisons.find((item) => item.id === "shielded-surface-scrub-wasm-stage2-derive-vs-shielded-surface-scrub");
    assert.equal(comparison?.baseVariant, "shielded-surface-scrub");
    assert.equal(comparison?.targetVariant, "shielded-surface-scrub-wasm-stage2-derive");
  });
});
