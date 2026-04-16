import { describe, it, assert } from "./test-framework.js";
import { buildManualScorecard, summarizePackageProtectionSmokeReport } from "../scripts/package-protection-smoke.mjs";
import { summarizePackageProtectionVerdict } from "../scripts/package-protection-verdict.mjs";

function buildSmokeReport({
  variant,
  channel,
  smokeStatus = "passed",
  automatedStatus = "passed",
  manualScorecard = null,
} = {}) {
  const report = summarizePackageProtectionSmokeReport({
    variant,
    channel,
    repeats: 2,
    xpi: {
      path: `/tmp/${variant}-${channel}.xpi`,
      sizeBytes: 2048,
    },
    bundle: {
      path: `/tmp/${variant}-${channel}.js`,
      sizeBytes: 4096,
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
          decodeMethod: "fromBase64",
          decodeDurationMs: 20,
          prepareDurationMs: 60,
          bootstrapResolveDurationMs: 60,
        },
      },
      {
        passed: true,
        readinessMode: "native",
        packageProtection: {
          decodeMethod: "fromBase64",
          decodeDurationMs: 21,
          prepareDurationMs: 61,
          bootstrapResolveDurationMs: 61,
        },
      },
    ],
  });

  report.status = smokeStatus;
  report.passed = smokeStatus === "passed";
  report.statusLabel = smokeStatus === "passed" ? "通过" : "失败";
  report.automatedScorecard.status = automatedStatus;
  report.automatedScorecard.passed = automatedStatus === "passed";
  if (manualScorecard) {
    report.manualScorecard = manualScorecard;
  }
  return report;
}

function buildAggregate(reports) {
  return {
    generatedAt: "2026-04-16T00:00:00.000Z",
    reports,
  };
}

describe("Package Protection Verdict", () => {
  it("should report passed when required smoke and manual checks are complete", () => {
    const verdict = summarizePackageProtectionVerdict(buildAggregate([
      buildSmokeReport({ variant: "plain", channel: "stable", automatedStatus: "attention" }),
      buildSmokeReport({ variant: "encrypted", channel: "stable" }),
      buildSmokeReport({
        variant: "shielded",
        channel: "stable",
        manualScorecard: buildManualScorecard({
          webcrackInitialResult: "high-level-architecture",
          llmSinglePassResult: "parse-fail / only-loader",
          status: "completed",
          completedAt: "2026-04-16T06:00:00.000Z",
        }),
      }),
      buildSmokeReport({ variant: "shielded", channel: "beta" }),
    ]));

    assert.equal(verdict.status, "passed");
    assert.equal(verdict.nextAction, "keep-current-shielded");
    assert.equal(verdict.targets.length, 4);
  });

  it("should report attention when shielded stable manual score is still pending", () => {
    const verdict = summarizePackageProtectionVerdict(buildAggregate([
      buildSmokeReport({ variant: "plain", channel: "stable", automatedStatus: "attention" }),
      buildSmokeReport({ variant: "encrypted", channel: "stable" }),
      buildSmokeReport({ variant: "shielded", channel: "stable" }),
      buildSmokeReport({ variant: "shielded", channel: "beta" }),
    ]));

    assert.equal(verdict.status, "attention");
    assert.equal(verdict.nextAction, "collect-manual-score");
    assert.equal(verdict.targets.find((target) => target.variant === "shielded" && target.channel === "stable")?.manualStatus, "pending");
  });

  it("should report attention when manual score can still recover readable modules", () => {
    const verdict = summarizePackageProtectionVerdict(buildAggregate([
      buildSmokeReport({ variant: "plain", channel: "stable", automatedStatus: "attention" }),
      buildSmokeReport({ variant: "encrypted", channel: "stable" }),
      buildSmokeReport({
        variant: "shielded",
        channel: "stable",
        manualScorecard: buildManualScorecard({
          webcrackInitialResult: "readable-module-recovery",
          llmSinglePassResult: "high-level-architecture",
          status: "completed",
          completedAt: "2026-04-16T06:00:00.000Z",
        }),
      }),
      buildSmokeReport({ variant: "shielded", channel: "beta" }),
    ]));

    assert.equal(verdict.status, "attention");
    assert.equal(verdict.nextAction, "open-future-hardening-wave");
  });

  it("should report failed when a required smoke target regresses", () => {
    const verdict = summarizePackageProtectionVerdict(buildAggregate([
      buildSmokeReport({ variant: "plain", channel: "stable", automatedStatus: "attention" }),
      buildSmokeReport({ variant: "encrypted", channel: "stable", automatedStatus: "attention" }),
      buildSmokeReport({
        variant: "shielded",
        channel: "stable",
        manualScorecard: buildManualScorecard({
          webcrackInitialResult: "high-level-architecture",
          llmSinglePassResult: "high-level-architecture",
          status: "completed",
          completedAt: "2026-04-16T06:00:00.000Z",
        }),
      }),
      buildSmokeReport({ variant: "shielded", channel: "beta" }),
    ]));

    assert.equal(verdict.status, "failed");
    assert.equal(verdict.nextAction, "fix-smoke-regression");
  });

  it("should report missing when a required target has no smoke report", () => {
    const verdict = summarizePackageProtectionVerdict(buildAggregate([
      buildSmokeReport({ variant: "plain", channel: "stable", automatedStatus: "attention" }),
      buildSmokeReport({ variant: "encrypted", channel: "stable" }),
      buildSmokeReport({
        variant: "shielded",
        channel: "stable",
        manualScorecard: buildManualScorecard({
          webcrackInitialResult: "high-level-architecture",
          llmSinglePassResult: "high-level-architecture",
          status: "completed",
          completedAt: "2026-04-16T06:00:00.000Z",
        }),
      }),
    ]));

    assert.equal(verdict.status, "missing");
    assert.equal(verdict.nextAction, "fix-smoke-regression");
    assert.equal(verdict.targets.find((target) => target.variant === "shielded" && target.channel === "beta")?.present, false);
  });
});
