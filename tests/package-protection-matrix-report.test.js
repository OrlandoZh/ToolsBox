import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import { summarizePackageProtectionSmokeReport } from "../scripts/package-protection-smoke.mjs";
import {
  parsePackageProtectionMatrixArgs,
  persistPackageProtectionMatrixReport,
  renderPackageProtectionMatrixMarkdown,
  selectStrongestGuidedAttackReport,
  summarizePackageProtectionMatrixReport,
} from "../scripts/package-protection-matrix-report.mjs";

function buildSmokeReport({
  variant,
  channel = "stable",
  llmSinglePassResult = null,
  xpiBytes = 100000,
  bundleBytes = 200000,
  durationMs = 1000,
  prepareDurationMs = 20,
} = {}) {
  return summarizePackageProtectionSmokeReport({
    variant,
    channel,
    repeats: 1,
    xpi: {
      path: `/tmp/${variant}.xpi`,
      sizeBytes: xpiBytes,
    },
    bundle: {
      path: `/tmp/${variant}.js`,
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
      passed: variant !== "plain",
      status: variant === "plain" ? "attention" : "passed",
    },
    manualScorecard: {
      webcrackInitialResult: variant === "plain" ? null : "parse-fail / only-loader",
      llmSinglePassResult,
      status: llmSinglePassResult ? "completed" : "pending",
      completedAt: llmSinglePassResult ? "2026-04-18T00:00:00.000Z" : null,
    },
    runs: [
      {
        runIndex: 1,
        passed: true,
        status: "passed",
        statusLabel: "通过",
        readinessMode: "native",
        apiReady: true,
        blockingRuntimeErrorCount: 0,
        hostNoiseErrorCount: 0,
        durationMs,
        packageProtection: {
          variant,
          decodeMethod: variant === "plain" ? null : "fromBase64",
          loadSubScriptDurationMs: variant === "plain" ? 0 : 10,
          decodeDurationMs: variant === "plain" ? 0 : 3,
          decryptDurationMs: variant === "plain" ? 0 : 10,
          evalDurationMs: variant === "plain" ? 0 : 6,
          prepareDurationMs: variant === "plain" ? 0 : prepareDurationMs,
          bootstrapResolveDurationMs: variant === "plain" ? 0 : prepareDurationMs,
        },
      },
    ],
  });
}

describe("Package Protection Matrix Report", () => {
  it("should parse default matrix args", () => {
    const options = parsePackageProtectionMatrixArgs([]);
    assert.ok(options.projectRootPath.endsWith("AddonTemplate4Z"));
    assert.ok(options.registryPath.endsWith(path.join("config", "package-protection-candidates.json")));
  });

  it("should prefer the strongest aggregate guided-attack profile over a stale alias fallback", () => {
    const fallbackReport = {
      generatedAt: "2026-04-18T00:00:00.000Z",
      variant: "shielded",
      channel: "stable",
      guidedAttack: {
        rating: "high-level-architecture",
        resultTier: "R1",
        attackerTier: "A1",
        aiTier: "M1",
        attackMethod: "static+webcrack",
        roundMode: "single-pass",
        timeBucket: "<10m",
      },
    };
    const aggregateReport = {
      reports: [
        fallbackReport,
        {
          generatedAt: "2026-04-18T01:00:00.000Z",
          variant: "shielded",
          channel: "stable",
          guidedAttack: {
            rating: "high-level-architecture",
            resultTier: "R1",
            attackerTier: "A2",
            aiTier: "M3",
            attackMethod: "static+reference",
            roundMode: "multi-round",
            timeBucket: "30-120m",
          },
        },
      ],
    };

    const selected = selectStrongestGuidedAttackReport(aggregateReport, {
      variant: "shielded",
      channel: "stable",
      fallbackReport,
    });

    assert.equal(selected?.guidedAttack?.attackerTier, "A2");
    assert.equal(selected?.guidedAttack?.aiTier, "M3");
    assert.equal(selected?.guidedAttack?.attackMethod, "static+reference");
    assert.equal(selected?.guidedAttack?.roundMode, "multi-round");
    assert.equal(selected?.guidedAttack?.timeBucket, "30-120m");
  });

  it("should fall back to the alias guided-attack report when aggregate evidence is missing", () => {
    const fallbackReport = {
      generatedAt: "2026-04-18T00:00:00.000Z",
      variant: "encrypted",
      channel: "stable",
      guidedAttack: {
        rating: "parse-fail / only-loader",
        resultTier: "R0",
        attackerTier: "A1",
        aiTier: "M1",
        attackMethod: "static-only",
        roundMode: "single-pass",
        timeBucket: "<10m",
      },
    };

    const selected = selectStrongestGuidedAttackReport({ reports: [] }, {
      variant: "encrypted",
      channel: "stable",
      fallbackReport,
    });

    assert.deepEqual(selected, fallbackReport);
  });

  it("should summarize current, compare, preflight, and source-proxy candidates", () => {
    const registry = {
      schemaVersion: 1,
      candidates: [
        {
          id: "encrypted",
          class: "current",
          stage: "stage0",
          executionMode: "buildable-xpi",
          evaluationKind: "variant",
          variant: "encrypted",
          channel: "stable",
          artifactCoverage: ["smoke", "perf", "verdict"],
          promotionGate: "keep-low-overhead-baseline",
          status: "current-baseline",
          summary: "encrypted baseline",
        },
        {
          id: "shielded-descriptor-bind",
          class: "experiment",
          stage: "stage2-runtime-recovery",
          executionMode: "buildable-xpi",
          evaluationKind: "compare",
          compareVariant: "shielded-descriptor-bind",
          channel: "stable",
          artifactCoverage: ["compare"],
          promotionGate: "runtime-only",
          status: "retained-runtime-only",
          summary: "descriptor compare",
        },
        {
          id: "jsconfuser-astscrambler-preflight",
          class: "preflight",
          stage: "stage3-ab",
          executionMode: "buildless-preflight",
          evaluationKind: "preflight",
          preflightArtifact: "package-protection-jsconfuser-preflight.json",
          artifactCoverage: ["preflight"],
          promotionGate: "promising-semantic-reduction",
          status: "evaluated-not-promising",
          summary: "jsconfuser preflight",
        },
        {
          id: "shielded-surface-scrub",
          class: "experiment",
          stage: "stage2-static-surface",
          executionMode: "buildable-xpi",
          evaluationKind: "compare",
          compareVariant: "shielded-surface-scrub",
          artifactCoverage: ["compare", "anchor-audit", "perf"],
          promotionGate: "prove-static-surface-benefit",
          status: "buildable-hardening-candidate",
          summary: "surface scrub",
        },
      ],
    };

    const smokeAggregate = {
      reports: [
        buildSmokeReport({
          variant: "encrypted",
          llmSinglePassResult: null,
          durationMs: 1048,
          prepareDurationMs: 19,
          xpiBytes: 781320,
          bundleBytes: 1042230,
        }),
      ],
    };
    const verdictReport = {
      status: "passed",
      nextAction: "keep-current-shielded",
      summary: "current route passed",
      targets: [
        {
          variant: "encrypted",
          channel: "stable",
          role: "required-baseline",
          summary: "baseline ok",
        },
      ],
    };
    const attackReport = {
      status: "passed",
      nextAction: "review-experimental-hardening",
      summary: "attack evidence ok",
      candidates: [
        {
          id: "encrypted",
          variant: "encrypted",
          channel: "stable",
          recommendedAction: "collect-a2-m3-guided-evidence",
          resistanceLabel: "architecture-recoverable-under-stronger-profile",
          evidenceStatus: "partial",
          summary: "encrypted still lacks fixed stronger-profile coverage",
          profileCoverage: {
            singlePassAutomation: {
              complete: false,
              rating: null,
            },
            guidedA2M3: {
              meetsTarget: false,
            },
          },
        },
      ],
    };
    const performanceReport = {
      channel: "stable",
      variants: [
        {
          variant: "encrypted",
          channel: "stable",
          summary: "duration 中位 1048ms；protection pipeline 中位 29ms",
          costDriver: "prepare",
          metrics: {
            durationMsMedian: 1048,
            protectionPipelineDurationMsMedian: 29,
          },
          xpiBytes: 781320,
          bundleBytes: 1042230,
        },
      ],
      comparisons: [
        {
          id: "encrypted-vs-plain",
          deltas: {
            duration: { absolute: 16 },
            protectionPipeline: { absolute: 29 },
            xpiBytes: { absolute: 620000 },
            bundleBytes: { absolute: 340000 },
          },
        },
      ],
    };
    const anchorAuditReport = {
      comparison: {
        plainCandidateAnchorCount: 30,
        encryptedRawAnchorCount: 0,
        shieldedRawAnchorCount: 0,
      },
      sourceProxy: {
        present: true,
        reducedAnchorCount: 30,
        reducedMatchCount: 103,
        remainingAnchorIds: ["addon-ref-literal"],
      },
      unpackedSurface: {
        present: true,
        totalAnchorCount: 2,
        totalMatchCount: 11,
        exposedFiles: ["content/preferences.js"],
        nextAction: "keep-surface-scrub-advisory",
        summary: "surface mostly scrubbed",
      },
    };
    const compareReports = {
      "shielded-descriptor-bind": {
        status: "passed",
        decision: "runtime-only",
        nextAction: "keep-runtime-only",
        summary: "descriptor-bind runtime-only",
        evidence: {
          smokeComplete: true,
          webcrackComplete: true,
          auditPresent: true,
          innerAuditComplete: true,
        },
        deltas: {
          xpiBytes: -12000,
          bundleBytes: -8000,
          decodeDurationMs: -3,
          prepareDurationMs: -20,
        },
        auditComparison: {
          rawAnchorDeltaCount: 0,
          rawMatchDeltaCount: 0,
        },
        candidate: {
          smoke: {
            llmSinglePassResult: null,
          },
          innerAudit: {
            rating: "high-level-architecture",
          },
          webcrack: {
            rating: "parse-fail / only-loader",
          },
          guidedAttack: null,
        },
        base: {
          innerAudit: {
            rating: "parse-fail / only-loader",
          },
        },
      },
      "shielded-surface-scrub": {
        status: "passed",
        decision: "hardening-win",
        nextAction: "promote-experimental-candidate",
        summary: "surface-scrub trims bootstrap literals without losing resistance",
        evidence: {
          smokeComplete: true,
          webcrackComplete: true,
          auditPresent: true,
          innerAuditComplete: true,
          guidedAttackSymmetryComplete: true,
          llmSymmetryComplete: false,
        },
        deltas: {
          xpiBytes: -18000,
          bundleBytes: -28000,
          decodeDurationMs: 0,
          prepareDurationMs: -6,
        },
        auditComparison: {
          rawAnchorDeltaCount: 0,
          rawMatchDeltaCount: 0,
          unpackedAnchorDeltaCount: -1,
          unpackedMatchDeltaCount: -2,
          residualFloorReached: true,
          residualExposedFiles: ["manifest.json"],
          residualAnchorIds: ["addon-version-literal", "update-url-literal"],
        },
        candidate: {
          smoke: {
            llmSinglePassResult: "parse-fail / only-loader",
          },
          innerAudit: {
            rating: "parse-fail / only-loader",
          },
          webcrack: {
            rating: "parse-fail / only-loader",
          },
          guidedAttack: {
            rating: "high-level-architecture",
            resultTier: "R1",
          },
        },
        base: {
          innerAudit: {
            rating: "parse-fail / only-loader",
          },
        },
      },
    };
    const preflightReports = {
      "jsconfuser-astscrambler-preflight": {
        status: "attention",
        nextAction: "not-promising-for-semantics",
        summary: "no meaningful semantic reduction",
        tool: {
          version: "2.0.1",
        },
        attempt: {
          growthRatio: 0.81,
        },
        semanticDelta: {
          inputAnchorCount: 7,
          outputAnchorCount: 7,
          reducedAnchorCount: 0,
          reducedMatchCount: 0,
        },
      },
    };

    const report = summarizePackageProtectionMatrixReport({
      registry,
      smokeAggregate,
      verdictReport,
      attackReport,
      performanceReport,
      anchorAuditReport,
      compareReports,
      preflightReports,
      guidedReports: {},
      webcrackReports: {},
    });

    assert.equal(report.status, "passed");
    assert.equal(report.nextAction, "keep-current-shielded");
    assert.equal(report.candidates.length, 4);
    const encrypted = report.candidates.find((candidate) => candidate.id === "encrypted");
    assert.equal(encrypted?.signals?.durationMsMedian, 1048);
    assert.equal(encrypted?.signals?.protectionPipelineDurationMsMedian, 29);
    assert.equal(encrypted?.recommendedAction, "collect-a2-m3-guided-evidence");
    assert.equal(encrypted?.signals?.attackResistanceLabel, "architecture-recoverable-under-stronger-profile");
    assert.equal(encrypted?.signals?.attackSinglePassComplete, false);
    assert.equal(encrypted?.signals?.attackGuidedA2M3Covered, false);
    assert.ok(report.summary.includes("encrypted(singlePassAutomation+guidedA2M3)"));
    const descriptor = report.candidates.find((candidate) => candidate.id === "shielded-descriptor-bind");
    assert.equal(descriptor?.signals?.compareDecision, "runtime-only");
    assert.equal(descriptor?.recommendedAction, "keep-runtime-only");
    assert.equal(descriptor?.signals?.baseInnerAuditRating, "parse-fail / only-loader");
    assert.equal(descriptor?.signals?.candidateInnerAuditRating, "high-level-architecture");
    const preflight = report.candidates.find((candidate) => candidate.id === "jsconfuser-astscrambler-preflight");
    assert.equal(preflight?.signals?.preflightStatus, "attention");
    assert.equal(preflight?.signals?.reducedAnchorCount, 0);
    const surface = report.candidates.find((candidate) => candidate.id === "shielded-surface-scrub");
    assert.equal(surface?.signals?.compareDecision, "hardening-win");
    assert.equal(surface?.signals?.guidedAttackRating, "high-level-architecture");
    assert.equal(surface?.signals?.llmSymmetryComplete, false);
    assert.equal(surface?.signals?.residualFloorReached, true);
    assert.deepEqual(surface?.signals?.residualExposedFiles, ["manifest.json"]);
    assert.ok(surface?.signals?.residualAnchorIds?.includes("addon-version-literal"));
    assert.ok(surface?.signals?.residualAnchorIds?.includes("update-url-literal"));
    assert.equal(surface?.recommendedAction, "collect-llm-symmetry-evidence");
    assert.ok(surface?.summary.includes("先补齐再谈 promotion"));
  });

  it("should summarize shielded-pref-bridge as a compare candidate with shielded-relative perf deltas", () => {
    const registry = {
      schemaVersion: 1,
      candidates: [
        {
          id: "shielded-pref-bridge",
          class: "experiment",
          stage: "stage2-static-surface",
          executionMode: "buildable-xpi",
          evaluationKind: "compare",
          compareVariant: "shielded-pref-bridge",
          channel: "stable",
          artifactCoverage: ["compare", "perf", "guided-attack"],
          promotionGate: "hardening-win-only",
          status: "promoted-hardening-candidate",
          summary: "pref-bridge compare",
        },
      ],
    };

    const performanceReport = {
      channel: "stable",
      variants: [],
      comparisons: [
        {
          id: "shielded-pref-bridge-vs-shielded",
          deltas: {
            duration: { absolute: 67.5 },
            protectionPipeline: { absolute: -5.5 },
            xpiBytes: { absolute: -16041 },
            bundleBytes: { absolute: -31224 },
          },
        },
      ],
    };

    const compareReports = {
      "shielded-pref-bridge": {
        status: "passed",
        decision: "hardening-win",
        nextAction: "promote-experimental-candidate",
        summary: "pref-bridge keeps resistance and trims static surface",
        evidence: {
          smokeComplete: true,
          webcrackComplete: true,
          auditPresent: true,
          preflightPresent: false,
          llmSymmetryComplete: true,
          innerAuditComplete: true,
          guidedAttackSymmetryComplete: true,
        },
        deltas: {
          xpiBytes: -16041,
          bundleBytes: -31224,
          decodeDurationMs: -2.5,
          prepareDurationMs: 0,
        },
        auditComparison: {
          rawAnchorDeltaCount: 0,
          rawMatchDeltaCount: 0,
        },
        candidate: {
          smoke: {
            llmSinglePassResult: "parse-fail / only-loader",
          },
          innerAudit: {
            rating: "parse-fail / only-loader",
          },
          webcrack: {
            rating: "parse-fail / only-loader",
          },
          guidedAttack: {
            rating: "high-level-architecture",
            resultTier: "R1",
          },
        },
        base: {
          innerAudit: {
            rating: "parse-fail / only-loader",
          },
        },
      },
    };

    const report = summarizePackageProtectionMatrixReport({
      registry,
      performanceReport,
      compareReports,
    });

    assert.equal(report.candidates.length, 1);
    assert.equal(report.candidates[0].id, "shielded-pref-bridge");
    assert.equal(report.candidates[0].evidenceStatus, "complete");
    assert.equal(report.candidates[0].signals.compareDecision, "hardening-win");
    assert.equal(report.candidates[0].signals.guidedAttackRating, "high-level-architecture");
    assert.equal(report.candidates[0].signals.xpiDelta, -16041);
    assert.equal(report.candidates[0].recommendedAction, "promote-experimental-candidate");
  });

  it("should treat a current variant as complete once fixed attack coverage is complete even without perf", () => {
    const report = summarizePackageProtectionMatrixReport({
      registry: {
        schemaVersion: 1,
        candidates: [
          {
            id: "encrypted",
            class: "current",
            stage: "stage0",
            executionMode: "buildable-xpi",
            evaluationKind: "variant",
            variant: "encrypted",
            channel: "stable",
            artifactCoverage: ["smoke", "guided-attack"],
            promotionGate: "keep-low-overhead-baseline",
            status: "current-baseline",
            summary: "encrypted baseline",
          },
        ],
      },
      smokeAggregate: {
        reports: [
          buildSmokeReport({
            variant: "encrypted",
            llmSinglePassResult: "parse-fail / only-loader",
          }),
        ],
      },
      attackReport: {
        candidates: [
          {
            id: "encrypted",
            variant: "encrypted",
            channel: "stable",
            evidenceStatus: "complete",
            recommendedAction: "probe-candidate-hardening",
            resistanceLabel: "architecture-recoverable-under-stronger-profile",
            profileCoverage: {
              singlePassAutomation: {
                complete: true,
                rating: "parse-fail / only-loader",
              },
              guidedA2M3: {
                meetsTarget: true,
                rating: "high-level-architecture",
              },
            },
          },
        ],
      },
    });

    assert.equal(report.candidates.length, 1);
    assert.equal(report.candidates[0].id, "encrypted");
    assert.equal(report.candidates[0].evidenceStatus, "complete");
  });

  it("should fall back to the promotion gate when no attack report candidate is available", () => {
    const report = summarizePackageProtectionMatrixReport({
      registry: {
        schemaVersion: 1,
        candidates: [
          {
            id: "encrypted",
            class: "current",
            stage: "stage0",
            executionMode: "buildable-xpi",
            evaluationKind: "variant",
            variant: "encrypted",
            channel: "stable",
            artifactCoverage: ["smoke"],
            promotionGate: "keep-low-overhead-baseline",
            status: "current-baseline",
            summary: "encrypted baseline",
          },
        ],
      },
      smokeAggregate: {
        reports: [
          buildSmokeReport({
            variant: "encrypted",
            llmSinglePassResult: null,
          }),
        ],
      },
    });

    assert.equal(report.candidates[0].recommendedAction, "keep-low-overhead-baseline");
    assert.equal(report.candidates[0].signals.attackResistanceLabel, null);
  });

  it("should surface source-proxy reduction metrics on the current shielded row", () => {
    const report = summarizePackageProtectionMatrixReport({
      registry: {
        schemaVersion: 1,
        candidates: [
          {
            id: "shielded",
            class: "current",
            stage: "stage0",
            executionMode: "buildable-xpi",
            evaluationKind: "variant",
            variant: "shielded",
            channel: "stable",
            artifactCoverage: ["smoke", "perf", "anchor-audit"],
            promotionGate: "keep-current-shielded",
            status: "current-primary",
            summary: "shielded primary",
          },
        ],
      },
      smokeAggregate: {
        reports: [
          buildSmokeReport({
            variant: "shielded",
            llmSinglePassResult: "high-level-architecture",
            durationMs: 1480,
            prepareDurationMs: 519,
            xpiBytes: 3723456,
            bundleBytes: 6134160,
          }),
        ],
      },
      performanceReport: {
        channel: "stable",
        variants: [
          {
            variant: "shielded",
            channel: "stable",
            metrics: {
              durationMsMedian: 1480,
              protectionPipelineDurationMsMedian: 519,
            },
            xpiBytes: 3723456,
            bundleBytes: 6134160,
          },
        ],
        comparisons: [
          {
            id: "shielded-vs-plain",
            deltas: {
              duration: { absolute: 448 },
              protectionPipeline: { absolute: 519 },
              xpiBytes: { absolute: 3576617 },
              bundleBytes: { absolute: 5431369 },
            },
          },
        ],
      },
      verdictReport: {
        status: "passed",
        nextAction: "keep-current-shielded",
        summary: "shielded current route passed",
        targets: [
          {
            variant: "shielded",
            channel: "stable",
            role: "required-primary",
            summary: "shielded ok",
          },
        ],
      },
      anchorAuditReport: {
        comparison: {
          shieldedRawAnchorCount: 0,
        },
        sourceProxy: {
          present: true,
          reducedAnchorCount: 48,
          reducedMatchCount: 172,
          remainingAnchorIds: ["addon-ref-literal", "host-action-reader-open"],
        },
        unpackedSurface: {
          present: true,
          totalAnchorCount: 16,
          totalMatchCount: 29,
          exposedFiles: ["manifest.json", "bootstrap.js", "prefs.js"],
        },
      },
    });

    assert.equal(report.candidates[0].signals.sourceProxyReducedAnchorCount, 48);
    assert.equal(report.candidates[0].signals.sourceProxyReducedMatchCount, 172);
    assert.deepEqual(report.candidates[0].signals.sourceProxyRemainingAnchorIDs, [
      "addon-ref-literal",
      "host-action-reader-open",
    ]);
    assert.equal(report.candidates[0].signals.unpackedSurfaceAnchorCount, 16);
  });

  it("should persist matrix artifacts", async () => {
    const projectRootPath = fs.mkdtempSync(path.join(os.tmpdir(), "package-protection-matrix-"));
    try {
      const report = summarizePackageProtectionMatrixReport({
        registry: {
          schemaVersion: 1,
          candidates: [],
        },
        verdictReport: {
          status: "passed",
          nextAction: "keep-current-shielded",
          summary: "ok",
        },
      });
      const paths = await persistPackageProtectionMatrixReport(report, {
        projectRootPath,
      });
      assert.ok(fs.existsSync(paths.reportPath));
      assert.ok(fs.existsSync(paths.reportMDPath));
      const markdown = fs.readFileSync(paths.reportMDPath, "utf-8");
      assert.ok(markdown.includes("Package Protection Experiment Matrix"));
      assert.ok(markdown.includes("keep-current-shielded"));
    } finally {
      fs.rmSync(projectRootPath, { recursive: true, force: true });
    }
  });

  it("should render residual surface floor signals for compare candidates", () => {
    const markdown = renderPackageProtectionMatrixMarkdown({
      generatedAt: "2026-04-19T00:00:00.000Z",
      advisory: true,
      status: "passed",
      statusLabel: "通过",
      nextAction: "keep-current-shielded",
      summary: "matrix summary",
      candidates: [
        {
          id: "shielded-surface-scrub",
          class: "experiment",
          stage: "stage2-static-surface",
          executionMode: "buildable-xpi",
          registryStatus: "promoted-hardening-candidate",
          evidenceStatus: "complete",
          promotionGate: "prove-static-surface-benefit",
          recommendedAction: "promote-experimental-candidate",
          summary: "surface-scrub summary",
          signals: {
            compareStatus: "passed",
            compareDecision: "hardening-win",
            residualFloorReached: true,
            residualExposedFiles: ["manifest.json"],
            residualAnchorIds: ["addon-version-literal", "update-url-literal"],
          },
        },
      ],
    });

    assert.ok(markdown.includes("residualSurface: floor=`yes` / exposedFiles=`manifest.json` / anchors=`addon-version-literal, update-url-literal`"));
  });
});
