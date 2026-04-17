import { describe, it, assert } from "./test-framework.js";
import { summarizePackageProtectionSmokeReport } from "../scripts/package-protection-smoke.mjs";
import {
  parsePackageProtectionExperimentCompareArgs,
  summarizePackageProtectionExperimentCompare,
} from "../scripts/package-protection-experiment-compare.mjs";

function buildSmokeReport({
  variant,
  channel = "stable",
  llmSinglePassResult = null,
  smokeStatus = "passed",
  automatedStatus = "passed",
  xpiBytes = 2000,
  bundleBytes = 6000,
  decodeDurationMs = 24,
  prepareDurationMs = 77,
  hostBinding = null,
  capabilityManifest = null,
} = {}) {
  const report = summarizePackageProtectionSmokeReport({
    variant,
    channel,
    repeats: 3,
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
    runs: [
      {
        passed: true,
        readinessMode: "native",
        hostBinding,
        capabilityManifest,
        packageProtection: {
          decodeMethod: "fromBase64",
          decodeDurationMs,
          prepareDurationMs,
          bootstrapResolveDurationMs: prepareDurationMs,
        },
      },
      {
        passed: true,
        readinessMode: "native",
        hostBinding,
        capabilityManifest,
        packageProtection: {
          decodeMethod: "fromBase64",
          decodeDurationMs: decodeDurationMs + 1,
          prepareDurationMs: prepareDurationMs + 1,
          bootstrapResolveDurationMs: prepareDurationMs + 1,
        },
      },
      {
        passed: true,
        readinessMode: "native",
        hostBinding,
        capabilityManifest,
        packageProtection: {
          decodeMethod: "fromBase64",
          decodeDurationMs: decodeDurationMs + 2,
          prepareDurationMs: prepareDurationMs + 2,
          bootstrapResolveDurationMs: prepareDurationMs + 2,
        },
      },
    ],
  });

  report.status = smokeStatus;
  report.passed = smokeStatus === "passed";
  report.automatedScorecard.status = automatedStatus;
  report.automatedScorecard.passed = automatedStatus === "passed";
  report.manualScorecard.llmSinglePassResult = llmSinglePassResult;
  report.manualScorecard.status = llmSinglePassResult ? "completed" : "pending";
  report.manualScorecard.completedAt = llmSinglePassResult ? "2026-04-17T00:00:00.000Z" : null;
  return report;
}

function buildWebcrackReport({
  variant,
  channel = "stable",
  status = "passed",
  rating = "parse-fail / only-loader",
  loaderAnchorCount = 2,
  semanticAnchorCount = 0,
} = {}) {
  return {
    generatedAt: "2026-04-17T00:00:00.000Z",
    advisory: true,
    variant,
    channel,
    status,
    suggestedWebcrackRating: rating,
    effectiveOutputSource: "fallback-loader",
    primaryAttempt: {
      durationMs: 10000,
    },
    fallbackAttempt: {
      durationMs: 2500,
    },
    outputScan: {
      loaderAnchorCount,
      loaderMatchCount: loaderAnchorCount,
      semanticAnchorCount,
      semanticMatchCount: semanticAnchorCount,
    },
  };
}

function buildInnerAuditReport({
  variant,
  channel = "stable",
  rating = "parse-fail / only-loader",
  overlayEntryCount = 0,
} = {}) {
  return {
    generatedAt: "2026-04-17T00:00:00.000Z",
    advisory: true,
    channel,
    status: "passed",
    variants: [
      {
        variant,
        status: "passed",
        statusLabel: "通过",
        summary: "inner audit",
        suggestedProxyLLMRating: rating,
        overlay: {
          present: overlayEntryCount > 0,
          entryCount: overlayEntryCount,
        },
        innerSemanticScan: {
          architectureAnchorCount: 0,
        },
        moduleRecoveryScan: {
          totalAnchorCount: 0,
        },
        packageProtection: {
          decodeMethod: "atob",
          prepareDurationMs: 100,
        },
      },
    ],
  };
}

describe("Package Protection Experiment Compare", () => {
  it("should parse experimental variant aliases", () => {
    const options = parsePackageProtectionExperimentCompareArgs([
      "--variant",
      "jsconfuser-string",
      "--channel",
      "stable",
    ]);

    assert.equal(options.variant, "shielded-jsconfuser-string");
    assert.equal(options.channel, "stable");
  });

  it("should retain descriptor-bind as a runtime-only candidate when host binding signals are present", () => {
    const report = summarizePackageProtectionExperimentCompare({
      variant: "shielded-descriptor-bind",
      channel: "stable",
      baseSmokeReport: buildSmokeReport({
        variant: "shielded",
      }),
      candidateSmokeReport: buildSmokeReport({
        variant: "shielded-descriptor-bind",
        xpiBytes: 2600,
        bundleBytes: 7000,
        hostBinding: {
          available: true,
          profileHash: "abc123",
          dbAvailable: true,
          noncePresent: true,
          nonceSource: "created",
        },
        capabilityManifest: {
          detailLevel: "full",
          overlayAvailable: true,
          overlayApplied: true,
          activationSatisfied: true,
          activationMissing: [],
        },
      }),
      baseWebcrackReport: buildWebcrackReport({
        variant: "shielded",
      }),
      candidateWebcrackReport: buildWebcrackReport({
        variant: "shielded-descriptor-bind",
      }),
      auditReport: {
        descriptorBindComparison: {
          present: true,
          sameRawSurface: true,
          rawAnchorDeltaCount: 0,
          rawMatchDeltaCount: 0,
          interpretation: "descriptor-bind 没有改变 raw export 暴露面。",
        },
      },
    });

    assert.equal(report.status, "passed");
    assert.equal(report.decision, "runtime-only");
    assert.equal(report.nextAction, "keep-runtime-only");
  });

  it("should require symmetric llm scoring before judging jsconfuser-string", () => {
    const report = summarizePackageProtectionExperimentCompare({
      variant: "shielded-jsconfuser-string",
      channel: "stable",
      baseSmokeReport: buildSmokeReport({
        variant: "shielded",
        llmSinglePassResult: "high-level-architecture",
      }),
      candidateSmokeReport: buildSmokeReport({
        variant: "shielded-jsconfuser-string",
        xpiBytes: 3200,
        bundleBytes: 9000,
      }),
      baseWebcrackReport: buildWebcrackReport({
        variant: "shielded",
      }),
      candidateWebcrackReport: buildWebcrackReport({
        variant: "shielded-jsconfuser-string",
      }),
      baseInnerAuditReport: buildInnerAuditReport({
        variant: "shielded",
        rating: "parse-fail / only-loader",
      }),
      candidateInnerAuditReport: buildInnerAuditReport({
        variant: "shielded-jsconfuser-string",
        rating: "parse-fail / only-loader",
      }),
      auditReport: {
        jsConfuserStringComparison: {
          present: true,
          sameRawSurface: true,
          rawAnchorDeltaCount: 0,
          rawMatchDeltaCount: 0,
          interpretation: "jsconfuser-string 没有改变 raw export 暴露面。",
        },
      },
      preflightReport: {
        status: "passed",
        semanticDelta: {
          inputAnchorCount: 7,
          outputAnchorCount: 0,
        },
        tool: {
          version: "2.0.1",
        },
        attempt: {
          growthRatio: 0.82,
        },
      },
    });

    assert.equal(report.status, "attention");
    assert.equal(report.decision, "needs-manual-ab");
    assert.equal(report.nextAction, "collect-llm-score");
    assert.equal(report.preflight.present, true);
    assert.equal(report.evidence.innerAuditComplete, true);
    assert.equal(report.base.innerAudit.rating, "parse-fail / only-loader");
    assert.equal(report.candidate.innerAudit.rating, "parse-fail / only-loader");
    assert.equal(report.summary.includes("inner audit proxy"), true);
  });

  it("should promote jsconfuser-string when llm readability is better than base shielded", () => {
    const report = summarizePackageProtectionExperimentCompare({
      variant: "shielded-jsconfuser-string",
      channel: "stable",
      baseSmokeReport: buildSmokeReport({
        variant: "shielded",
        llmSinglePassResult: "high-level-architecture",
      }),
      candidateSmokeReport: buildSmokeReport({
        variant: "shielded-jsconfuser-string",
        llmSinglePassResult: "parse-fail / only-loader",
        xpiBytes: 3200,
        bundleBytes: 9000,
      }),
      baseWebcrackReport: buildWebcrackReport({
        variant: "shielded",
      }),
      candidateWebcrackReport: buildWebcrackReport({
        variant: "shielded-jsconfuser-string",
      }),
      auditReport: {
        jsConfuserStringComparison: {
          present: true,
          sameRawSurface: true,
          rawAnchorDeltaCount: 0,
          rawMatchDeltaCount: 0,
          interpretation: "jsconfuser-string 没有改变 raw export 暴露面。",
        },
      },
    });

    assert.equal(report.status, "passed");
    assert.equal(report.decision, "hardening-win");
    assert.equal(report.nextAction, "promote-experimental-candidate");
  });

  it("should mark jsconfuser-string as leaning-same when llm score is unchanged", () => {
    const report = summarizePackageProtectionExperimentCompare({
      variant: "shielded-jsconfuser-string",
      channel: "stable",
      baseSmokeReport: buildSmokeReport({
        variant: "shielded",
        llmSinglePassResult: "high-level-architecture",
      }),
      candidateSmokeReport: buildSmokeReport({
        variant: "shielded-jsconfuser-string",
        llmSinglePassResult: "high-level-architecture",
        xpiBytes: 3200,
        bundleBytes: 9000,
        decodeDurationMs: 29,
        prepareDurationMs: 87,
      }),
      baseWebcrackReport: buildWebcrackReport({
        variant: "shielded",
      }),
      candidateWebcrackReport: buildWebcrackReport({
        variant: "shielded-jsconfuser-string",
      }),
      auditReport: {
        jsConfuserStringComparison: {
          present: true,
          sameRawSurface: true,
          rawAnchorDeltaCount: 0,
          rawMatchDeltaCount: 0,
          interpretation: "jsconfuser-string 没有改变 raw export 暴露面。",
        },
      },
      preflightReport: {
        status: "passed",
        semanticDelta: {
          inputAnchorCount: 7,
          outputAnchorCount: 0,
        },
        tool: {
          version: "2.0.1",
        },
        attempt: {
          growthRatio: 0.82,
        },
      },
    });

    assert.equal(report.status, "attention");
    assert.equal(report.decision, "leaning-same");
    assert.equal(report.nextAction, "stop-current-candidate");
  });
});
