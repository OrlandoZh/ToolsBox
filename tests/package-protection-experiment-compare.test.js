import { describe, it, assert } from "./test-framework.js";
import { summarizePackageProtectionSmokeReport } from "../scripts/package-protection-smoke.mjs";
import {
  parsePackageProtectionExperimentCompareArgs,
  resolvePackageProtectionExperimentCompareBaseVariant,
  selectSharedGuidedAttackReports,
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

function buildGuidedAttackReport({
  variant,
  channel = "stable",
  rating = "high-level-architecture",
  resultTier = "R1",
  attackerTier = "A2",
  aiTier = "M3",
  attackMethod = "static+reference",
  timeBucket = "30-120m",
  roundMode = "multi-round",
  profileKey = null,
} = {}) {
  return {
    generatedAt: "2026-04-17T00:00:00.000Z",
    advisory: true,
    variant,
    channel,
    smokeStatus: "passed",
    automatedStatus: "passed",
    manualSinglePass: {
      status: "completed",
      webcrackInitialResult: "parse-fail / only-loader",
      llmSinglePassResult: rating,
      completedAt: "2026-04-17T00:00:00.000Z",
    },
    guidedAttack: {
      rating,
      resultTier,
      attackerTier,
      aiTier,
      attackMethod,
      attackPath: attackMethod,
      timeBucket,
      costBucket: timeBucket,
      roundMode,
      profileKey,
      summary: "guided attack",
      notes: "guided attack notes",
      evidenceFiles: [],
    },
    comparison: {
      singlePassLLMRating: rating,
      singlePassAvailable: true,
      relation: "same-as-single-pass-llm",
    },
    nextAction: "probe-candidate-hardening",
    profileKey,
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

  it("should parse pref-bridge as an experimental variant alias", () => {
    const options = parsePackageProtectionExperimentCompareArgs([
      "--variant",
      "pref-bridge",
      "--channel",
      "stable",
    ]);

    assert.equal(options.variant, "shielded-pref-bridge");
    assert.equal(options.channel, "stable");
  });

  it("should parse surface-scrub as an experimental variant alias", () => {
    const options = parsePackageProtectionExperimentCompareArgs([
      "--variant",
      "surface-scrub",
      "--channel",
      "stable",
    ]);

    assert.equal(options.variant, "shielded-surface-scrub");
    assert.equal(options.channel, "stable");
  });

  it("should parse wasm-digest as an experimental variant alias", () => {
    const options = parsePackageProtectionExperimentCompareArgs([
      "--variant",
      "wasm-digest",
      "--channel",
      "stable",
    ]);

    assert.equal(options.variant, "shielded-surface-scrub-wasm-digest");
    assert.equal(options.channel, "stable");
  });

  it("should resolve surface-scrub as the compare base for the wasm digest candidate", () => {
    assert.equal(
      resolvePackageProtectionExperimentCompareBaseVariant("shielded-surface-scrub-wasm-digest"),
      "shielded-surface-scrub",
    );
    assert.equal(
      resolvePackageProtectionExperimentCompareBaseVariant("wasm-digest"),
      "shielded-surface-scrub",
    );
    assert.equal(
      resolvePackageProtectionExperimentCompareBaseVariant("shielded-pref-bridge"),
      "shielded",
    );
  });

  it("should prefer the strongest shared guided-attack profile from aggregate over stale aliases", () => {
    const baseAlias = buildGuidedAttackReport({
      variant: "shielded",
      attackerTier: "A1",
      aiTier: "M1",
      attackMethod: "static-only",
      timeBucket: "<10m",
      roundMode: "single-pass",
      profileKey: "a1__m1__static-only__single-pass__lt10m",
    });
    const candidateAlias = buildGuidedAttackReport({
      variant: "shielded-pref-bridge",
      attackerTier: "A1",
      aiTier: "M1",
      attackMethod: "static-only",
      timeBucket: "<10m",
      roundMode: "single-pass",
      profileKey: "a1__m1__static-only__single-pass__lt10m",
    });
    const aggregate = {
      reports: [
        baseAlias,
        candidateAlias,
        buildGuidedAttackReport({
          variant: "shielded",
          profileKey: "a2__m3__static-reference__multi-round__30-120m",
        }),
        buildGuidedAttackReport({
          variant: "shielded-pref-bridge",
          profileKey: "a2__m3__static-reference__multi-round__30-120m",
        }),
      ],
    };

    const selection = selectSharedGuidedAttackReports(aggregate, {
      baseVariant: "shielded",
      candidateVariant: "shielded-pref-bridge",
      channel: "stable",
      baseFallbackReport: baseAlias,
      candidateFallbackReport: candidateAlias,
    });

    assert.equal(selection.source, "aggregate-shared");
    assert.equal(selection.selectedProfileKey, "a2__m3__static-reference__multi-round__30-120m");
    assert.equal(selection.baseGuidedAttackReport.guidedAttack.attackerTier, "A2");
    assert.equal(selection.candidateGuidedAttackReport.guidedAttack.attackerTier, "A2");
  });

  it("should fall back to alias guided-attack reports when aggregate has no shared profile", () => {
    const baseAlias = buildGuidedAttackReport({
      variant: "shielded",
      attackerTier: "A1",
      aiTier: "M1",
      attackMethod: "static-only",
      timeBucket: "<10m",
      roundMode: "single-pass",
      profileKey: "a1__m1__static-only__single-pass__lt10m",
    });
    const candidateAlias = buildGuidedAttackReport({
      variant: "shielded-pref-bridge",
      attackerTier: "A1",
      aiTier: "M1",
      attackMethod: "static-only",
      timeBucket: "<10m",
      roundMode: "single-pass",
      profileKey: "a1__m1__static-only__single-pass__lt10m",
    });
    const aggregate = {
      reports: [
        buildGuidedAttackReport({
          variant: "shielded",
          profileKey: "a2__m3__static-reference__multi-round__30-120m",
        }),
      ],
    };

    const selection = selectSharedGuidedAttackReports(aggregate, {
      baseVariant: "shielded",
      candidateVariant: "shielded-pref-bridge",
      channel: "stable",
      baseFallbackReport: baseAlias,
      candidateFallbackReport: candidateAlias,
    });

    assert.equal(selection.source, "fallback-alias");
    assert.equal(selection.selectedProfileKey, null);
    assert.equal(selection.baseGuidedAttackReport.guidedAttack.attackerTier, "A1");
    assert.equal(selection.candidateGuidedAttackReport.guidedAttack.attackerTier, "A1");
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
      baseInnerAuditReport: buildInnerAuditReport({
        variant: "shielded",
        rating: "parse-fail / only-loader",
      }),
      candidateInnerAuditReport: buildInnerAuditReport({
        variant: "shielded-descriptor-bind",
        rating: "high-level-architecture",
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
    assert.equal(report.summary.includes("inner audit proxy"), true);
    assert.equal(report.summary.includes("descriptor-bind=high-level-architecture"), true);
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

  it("should promote pref-bridge when unpacked static surface is reduced without losing automated resistance", () => {
    const report = summarizePackageProtectionExperimentCompare({
      variant: "shielded-pref-bridge",
      channel: "stable",
      baseSmokeReport: buildSmokeReport({
        variant: "shielded",
        llmSinglePassResult: "high-level-architecture",
      }),
      candidateSmokeReport: buildSmokeReport({
        variant: "shielded-pref-bridge",
        xpiBytes: 1980,
        bundleBytes: 5980,
      }),
      baseWebcrackReport: buildWebcrackReport({
        variant: "shielded",
      }),
      candidateWebcrackReport: buildWebcrackReport({
        variant: "shielded-pref-bridge",
      }),
      baseInnerAuditReport: buildInnerAuditReport({
        variant: "shielded",
        rating: "parse-fail / only-loader",
      }),
      candidateInnerAuditReport: buildInnerAuditReport({
        variant: "shielded-pref-bridge",
        rating: "parse-fail / only-loader",
      }),
      auditReport: {
        prefBridgeComparison: {
          present: true,
          sameRawSurface: true,
          rawAnchorDeltaCount: 0,
          rawMatchDeltaCount: 0,
          sameUnpackedSurface: false,
          unpackedAnchorDeltaCount: -2,
          unpackedMatchDeltaCount: -4,
          interpretation: "pref-bridge 压缩了解包后的 support surface。",
        },
      },
    });

    assert.equal(report.status, "passed");
    assert.equal(report.decision, "hardening-win");
    assert.equal(report.nextAction, "promote-experimental-candidate");
    assert.equal(report.auditComparison.sameUnpackedSurface, false);
    assert.equal(report.auditComparison.unpackedAnchorDeltaCount, -2);
  });

  it("should not promote pref-bridge when unpacked static surface stays the same", () => {
    const report = summarizePackageProtectionExperimentCompare({
      variant: "shielded-pref-bridge",
      channel: "stable",
      baseSmokeReport: buildSmokeReport({
        variant: "shielded",
      }),
      candidateSmokeReport: buildSmokeReport({
        variant: "shielded-pref-bridge",
      }),
      baseWebcrackReport: buildWebcrackReport({
        variant: "shielded",
      }),
      candidateWebcrackReport: buildWebcrackReport({
        variant: "shielded-pref-bridge",
      }),
      baseInnerAuditReport: buildInnerAuditReport({
        variant: "shielded",
        rating: "parse-fail / only-loader",
      }),
      candidateInnerAuditReport: buildInnerAuditReport({
        variant: "shielded-pref-bridge",
        rating: "parse-fail / only-loader",
      }),
      auditReport: {
        prefBridgeComparison: {
          present: true,
          sameRawSurface: true,
          rawAnchorDeltaCount: 0,
          rawMatchDeltaCount: 0,
          sameUnpackedSurface: true,
          unpackedAnchorDeltaCount: 0,
          unpackedMatchDeltaCount: 0,
          interpretation: "pref-bridge 没有改变最终 XPI 的 support surface。",
        },
      },
    });

    assert.equal(report.status, "attention");
    assert.equal(report.decision, "leaning-same");
    assert.equal(report.nextAction, "stop-current-candidate");
  });

  it("should promote surface-scrub when bootstrap static surface is reduced without losing automated resistance", () => {
    const report = summarizePackageProtectionExperimentCompare({
      variant: "shielded-surface-scrub",
      channel: "stable",
      baseSmokeReport: buildSmokeReport({
        variant: "shielded",
        llmSinglePassResult: "high-level-architecture",
      }),
      candidateSmokeReport: buildSmokeReport({
        variant: "shielded-surface-scrub",
        xpiBytes: 1970,
        bundleBytes: 5960,
      }),
      baseWebcrackReport: buildWebcrackReport({
        variant: "shielded",
      }),
      candidateWebcrackReport: buildWebcrackReport({
        variant: "shielded-surface-scrub",
      }),
      baseInnerAuditReport: buildInnerAuditReport({
        variant: "shielded",
        rating: "parse-fail / only-loader",
      }),
      candidateInnerAuditReport: buildInnerAuditReport({
        variant: "shielded-surface-scrub",
        rating: "parse-fail / only-loader",
      }),
      auditReport: {
        surfaceScrubComparison: {
          present: true,
          sameRawSurface: true,
          rawAnchorDeltaCount: 0,
          rawMatchDeltaCount: 0,
          sameUnpackedSurface: false,
          unpackedAnchorDeltaCount: -1,
          unpackedMatchDeltaCount: -2,
          residualFloorReached: true,
          residualExposedFiles: ["manifest.json"],
          residualAnchorIds: ["addon-version-literal", "update-url-literal"],
          interpretation: "surface-scrub 没有改变 raw export 暴露面，但继续压缩了最终 XPI 的 unpacked support surface。",
        },
      },
    });

    assert.equal(report.status, "passed");
    assert.equal(report.decision, "hardening-win");
    assert.equal(report.nextAction, "promote-experimental-candidate");
    assert.equal(report.auditComparison.sameUnpackedSurface, false);
    assert.equal(report.auditComparison.unpackedAnchorDeltaCount, -1);
    assert.equal(report.summary.includes("manifest 兼容性下限"), true);
    assert.equal(report.auditComparison.residualFloorReached, true);
  });

  it("should keep surface-scrub advisory when unpacked static surface stays the same", () => {
    const report = summarizePackageProtectionExperimentCompare({
      variant: "shielded-surface-scrub",
      channel: "stable",
      baseSmokeReport: buildSmokeReport({
        variant: "shielded",
      }),
      candidateSmokeReport: buildSmokeReport({
        variant: "shielded-surface-scrub",
      }),
      baseWebcrackReport: buildWebcrackReport({
        variant: "shielded",
      }),
      candidateWebcrackReport: buildWebcrackReport({
        variant: "shielded-surface-scrub",
      }),
      baseInnerAuditReport: buildInnerAuditReport({
        variant: "shielded",
        rating: "parse-fail / only-loader",
      }),
      candidateInnerAuditReport: buildInnerAuditReport({
        variant: "shielded-surface-scrub",
        rating: "parse-fail / only-loader",
      }),
      auditReport: {
        surfaceScrubComparison: {
          present: true,
          sameRawSurface: true,
          rawAnchorDeltaCount: 0,
          rawMatchDeltaCount: 0,
          sameUnpackedSurface: true,
          unpackedAnchorDeltaCount: 0,
          unpackedMatchDeltaCount: 0,
          interpretation: "surface-scrub 当前没有改变可观测静态表面。",
        },
      },
    });

    assert.equal(report.status, "attention");
    assert.equal(report.decision, "leaning-same");
    assert.equal(report.nextAction, "stop-current-candidate");
  });

  it("should promote surface-scrub-wasm-digest when it stays bounded to content/lib/w and keeps resistance", () => {
    const report = summarizePackageProtectionExperimentCompare({
      variant: "shielded-surface-scrub-wasm-digest",
      channel: "stable",
      baseSmokeReport: buildSmokeReport({
        variant: "shielded-surface-scrub",
        llmSinglePassResult: "high-level-architecture",
        decodeDurationMs: 24,
        prepareDurationMs: 79,
      }),
      candidateSmokeReport: buildSmokeReport({
        variant: "shielded-surface-scrub-wasm-digest",
        llmSinglePassResult: "high-level-architecture",
        xpiBytes: 2080,
        bundleBytes: 6080,
        decodeDurationMs: 31,
        prepareDurationMs: 84,
      }),
      baseWebcrackReport: buildWebcrackReport({
        variant: "shielded-surface-scrub",
        rating: "parse-fail / only-loader",
      }),
      candidateWebcrackReport: buildWebcrackReport({
        variant: "shielded-surface-scrub-wasm-digest",
        rating: "parse-fail / only-loader",
      }),
      baseInnerAuditReport: buildInnerAuditReport({
        variant: "shielded-surface-scrub",
        rating: "parse-fail / only-loader",
      }),
      candidateInnerAuditReport: buildInnerAuditReport({
        variant: "shielded-surface-scrub-wasm-digest",
        rating: "parse-fail / only-loader",
      }),
      baseGuidedAttackReport: buildGuidedAttackReport({
        variant: "shielded-surface-scrub",
        rating: "high-level-architecture",
        resultTier: "R1",
      }),
      candidateGuidedAttackReport: buildGuidedAttackReport({
        variant: "shielded-surface-scrub-wasm-digest",
        rating: "high-level-architecture",
        resultTier: "R1",
      }),
      auditReport: {
        surfaceScrubWasmDigestComparison: {
          present: true,
          sameRawSurface: true,
          rawAnchorDeltaCount: 0,
          rawMatchDeltaCount: 0,
          sameUnpackedSurface: false,
          unpackedAnchorDeltaCount: 0,
          unpackedMatchDeltaCount: 0,
          packageBoundaryWithinWasmAssets: true,
          newExposedFiles: ["content/lib/w/probe.wasm"],
          unexpectedExposedFiles: [],
          interpretation: "surface-scrub-wasm-digest 的新增 package-boundary 暴露仅限 content/lib/w/probe.wasm。",
        },
      },
    });

    assert.equal(report.baseVariant, "shielded-surface-scrub");
    assert.equal(report.status, "passed");
    assert.equal(report.decision, "hardening-win");
    assert.equal(report.nextAction, "promote-experimental-candidate");
    assert.equal(report.auditComparison.packageBoundaryWithinWasmAssets, true);
    assert.deepEqual(report.auditComparison.newExposedFiles, ["content/lib/w/probe.wasm"]);
    assert.equal(report.deltas.decodeDurationMs, 7);
    assert.equal(report.summary.includes("content/lib/w/*"), true);
  });

  it("should avoid claiming semantic compression when jsconfuser preflight failed", () => {
    const report = summarizePackageProtectionExperimentCompare({
      variant: "shielded-jsconfuser-string",
      channel: "stable",
      baseSmokeReport: buildSmokeReport({
        variant: "shielded",
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
        status: "failed",
        semanticDelta: {
          inputAnchorCount: 0,
          outputAnchorCount: 0,
          reducedAnchorCount: 0,
          reducedMatchCount: 0,
        },
        tool: {
          version: "2.0.1",
        },
        attempt: {
          growthRatio: 0,
        },
      },
    });

    assert.equal(report.status, "attention");
    assert.equal(report.decision, "needs-manual-ab");
    assert.equal(report.summary.includes("可用的语义压缩证据"), true);
    assert.equal(report.summary.includes("0 -> 0"), false);
  });

  it("should require guided-attack symmetry before promoting jsconfuser-string from a single-pass win", () => {
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
      baseGuidedAttackReport: buildGuidedAttackReport({
        variant: "shielded",
        rating: "high-level-architecture",
        resultTier: "R1",
      }),
    });

    assert.equal(report.status, "attention");
    assert.equal(report.decision, "needs-manual-ab");
    assert.equal(report.nextAction, "collect-guided-attack");
  });

  it("should lean same when jsconfuser-string only wins single-pass but guided attack stays at the same tier", () => {
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
      baseGuidedAttackReport: buildGuidedAttackReport({
        variant: "shielded",
        rating: "high-level-architecture",
        resultTier: "R1",
      }),
      candidateGuidedAttackReport: buildGuidedAttackReport({
        variant: "shielded-jsconfuser-string",
        rating: "high-level-architecture",
        resultTier: "R1",
      }),
    });

    assert.equal(report.status, "attention");
    assert.equal(report.decision, "leaning-same");
    assert.equal(report.nextAction, "stop-current-candidate");
  });

  it("should promote jsconfuser-string only when guided attack is also better than base shielded", () => {
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
      baseGuidedAttackReport: buildGuidedAttackReport({
        variant: "shielded",
        rating: "high-level-architecture",
        resultTier: "R1",
      }),
      candidateGuidedAttackReport: buildGuidedAttackReport({
        variant: "shielded-jsconfuser-string",
        rating: "parse-fail / only-loader",
        resultTier: "R0",
      }),
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
