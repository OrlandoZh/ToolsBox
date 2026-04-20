import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import { summarizePackageProtectionSmokeReport } from "../scripts/package-protection-smoke.mjs";
import {
  parsePackageProtectionAttackReportArgs,
  persistPackageProtectionAttackReport,
  summarizePackageProtectionAttackReport,
} from "../scripts/package-protection-attack-report.mjs";

function buildSmokeReport({
  variant,
  channel = "stable",
  webcrackInitialResult = "parse-fail / only-loader",
  llmSinglePassResult = "parse-fail / only-loader",
} = {}) {
  return summarizePackageProtectionSmokeReport({
    variant,
    channel,
    repeats: 1,
    xpi: {
      path: `/tmp/${variant}.xpi`,
      sizeBytes: 100000,
    },
    bundle: {
      path: `/tmp/${variant}.js`,
      sizeBytes: 200000,
    },
    automatedScorecard: {
      metadataLeakFree: true,
      leakedMarkers: [],
      contiguousPayloadHidden: true,
      maxBase64LiteralLength: 96,
      plainModuleDefsHidden: true,
      hostileRuntimeOptionsDisabled: true,
      loaderOptions: null,
      passed: true,
      status: "passed",
    },
    manualScorecard: {
      webcrackInitialResult,
      llmSinglePassResult,
      status: webcrackInitialResult && llmSinglePassResult ? "completed" : "pending",
      completedAt: webcrackInitialResult && llmSinglePassResult ? "2026-04-18T00:00:00.000Z" : null,
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
        durationMs: 1500,
        packageProtection: {
          variant,
          decodeMethod: variant === "plain" ? null : "fromBase64",
          loadSubScriptDurationMs: 10,
          decodeDurationMs: 3,
          decryptDurationMs: 10,
          evalDurationMs: 6,
          prepareDurationMs: 20,
          bootstrapResolveDurationMs: 20,
        },
      },
    ],
  });
}

describe("Package Protection Attack Report", () => {
  it("should parse default attack report args", () => {
    const options = parsePackageProtectionAttackReportArgs([]);
    assert.ok(options.projectRootPath.endsWith("AddonTemplate4Z"));
    assert.ok(options.registryPath.endsWith(path.join("config", "package-protection-candidates.json")));
  });

  it("should summarize strongest guided profile and hardening candidate state", () => {
    const registry = {
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
          artifactCoverage: ["smoke", "webcrack", "guided-attack"],
          promotionGate: "keep-current-shielded",
          status: "current-primary",
          summary: "shielded current",
        },
        {
          id: "shielded-pref-bridge",
          class: "experiment",
          stage: "stage2-static-surface",
          executionMode: "buildable-xpi",
          evaluationKind: "compare",
          compareVariant: "shielded-pref-bridge",
          channel: "stable",
          artifactCoverage: ["smoke", "webcrack", "guided-attack", "compare"],
          promotionGate: "hardening-win-only",
          status: "promoted-hardening-candidate",
          summary: "pref bridge compare",
        },
      ],
    };

    const smokeAggregate = {
      reports: [
        buildSmokeReport({
          variant: "shielded",
          webcrackInitialResult: "parse-fail / only-loader",
          llmSinglePassResult: "high-level-architecture",
        }),
        buildSmokeReport({
          variant: "shielded-pref-bridge",
          webcrackInitialResult: "parse-fail / only-loader",
          llmSinglePassResult: "parse-fail / only-loader",
        }),
      ],
    };

    const guidedAggregateReport = {
      reports: [
        {
          generatedAt: "2026-04-18T00:00:00.000Z",
          variant: "shielded",
          channel: "stable",
          guidedAttack: {
            rating: "high-level-architecture",
            resultTier: "R1",
            attackerTier: "A1",
            aiTier: "M1",
            attackMethod: "static+webcrack",
            timeBucket: "<10m",
            roundMode: "single-pass",
          },
          comparison: {
            relation: "same-as-single-pass-llm",
          },
          nextAction: "probe-candidate-hardening",
        },
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
            timeBucket: "30-120m",
            roundMode: "multi-round",
          },
          comparison: {
            relation: "same-as-single-pass-llm",
          },
          nextAction: "probe-candidate-hardening",
        },
        {
          generatedAt: "2026-04-18T01:00:00.000Z",
          variant: "shielded-pref-bridge",
          channel: "stable",
          guidedAttack: {
            rating: "high-level-architecture",
            resultTier: "R1",
            attackerTier: "A2",
            aiTier: "M3",
            attackMethod: "static+reference",
            timeBucket: "30-120m",
            roundMode: "multi-round",
          },
          comparison: {
            relation: "stronger-than-single-pass-llm",
          },
          nextAction: "probe-candidate-hardening",
        },
      ],
    };

    const webcrackReports = {
      "shielded:stable": {
        suggestedWebcrackRating: "parse-fail / only-loader",
        summary: "loader only",
      },
      "shielded-pref-bridge:stable": {
        suggestedWebcrackRating: "parse-fail / only-loader",
        summary: "loader only",
      },
    };

    const compareReports = {
      "shielded-pref-bridge": {
        status: "passed",
        decision: "hardening-win",
        nextAction: "promote-experimental-candidate",
        summary: "pref bridge keeps resistance",
        evidence: {
          guidedAttackSymmetryComplete: true,
        },
        base: {
          guidedAttack: {
            rating: "high-level-architecture",
            resultTier: "R1",
          },
        },
        candidate: {
          guidedAttack: {
            rating: "high-level-architecture",
            resultTier: "R1",
          },
        },
      },
    };

    const report = summarizePackageProtectionAttackReport({
      registry,
      smokeAggregate,
      guidedAggregateReport,
      webcrackReports,
      compareReports,
    });

    assert.equal(report.status, "passed");
    assert.equal(report.nextAction, "review-experimental-hardening");
    const shielded = report.candidates.find((candidate) => candidate.id === "shielded");
    assert.equal(shielded.attack.guidedAttack.attackerTier, "A2");
    assert.equal(shielded.attack.guidedAttack.aiTier, "M3");
    assert.equal(shielded.resistanceLabel, "architecture-recoverable-under-stronger-profile");
    assert.equal(shielded.profileCoverage.singlePassAutomation.complete, true);
    assert.equal(shielded.profileCoverage.guidedA2M3.meetsTarget, true);
    const prefBridge = report.candidates.find((candidate) => candidate.id === "shielded-pref-bridge");
    assert.equal(prefBridge.compare.decision, "hardening-win");
    assert.equal(prefBridge.recommendedAction, "promote-experimental-candidate");
    assert.equal(prefBridge.profileCoverage.guidedA2M3.meetsTarget, true);
  });

  it("should raise attention when strongest guided evidence reaches readable module recovery", () => {
    const registry = {
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
          artifactCoverage: ["smoke", "webcrack", "guided-attack"],
          promotionGate: "keep-current-shielded",
          status: "current-primary",
          summary: "shielded current",
        },
      ],
    };

    const report = summarizePackageProtectionAttackReport({
      registry,
      smokeAggregate: {
        reports: [
          buildSmokeReport({
            variant: "shielded",
            webcrackInitialResult: "parse-fail / only-loader",
            llmSinglePassResult: "high-level-architecture",
          }),
        ],
      },
      guidedAggregateReport: {
        reports: [
          {
            generatedAt: "2026-04-18T01:00:00.000Z",
            variant: "shielded",
            channel: "stable",
            guidedAttack: {
              rating: "readable-module-recovery",
              resultTier: "R3",
              attackerTier: "A3",
              aiTier: "M4",
              attackMethod: "dynamic-hooked",
              timeBucket: "30-120m",
              roundMode: "multi-round",
            },
            nextAction: "open-future-hardening-wave",
          },
        ],
      },
      webcrackReports: {
        "shielded:stable": {
          suggestedWebcrackRating: "parse-fail / only-loader",
          summary: "loader only",
        },
      },
    });

    assert.equal(report.status, "attention");
    assert.equal(report.nextAction, "open-future-hardening-wave");
    assert.equal(report.candidates[0].resistanceLabel, "readable-module-risk");
    assert.equal(report.candidates[0].profileCoverage.guidedA2M3.meetsTarget, true);
  });

  it("should request fixed A2/M3 profile collection when shielded only has weaker guided evidence", () => {
    const registry = {
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
          artifactCoverage: ["smoke", "webcrack", "guided-attack"],
          promotionGate: "keep-current-shielded",
          status: "current-primary",
          summary: "shielded current",
        },
      ],
    };

    const report = summarizePackageProtectionAttackReport({
      registry,
      smokeAggregate: {
        reports: [
          buildSmokeReport({
            variant: "shielded",
            webcrackInitialResult: "parse-fail / only-loader",
            llmSinglePassResult: "high-level-architecture",
          }),
        ],
      },
      guidedAggregateReport: {
        reports: [
          {
            generatedAt: "2026-04-18T01:00:00.000Z",
            variant: "shielded",
            channel: "stable",
            guidedAttack: {
              rating: "high-level-architecture",
              resultTier: "R1",
              attackerTier: "A1",
              aiTier: "M1",
              attackMethod: "static+webcrack",
              timeBucket: "<10m",
              roundMode: "single-pass",
            },
            nextAction: "probe-candidate-hardening",
          },
        ],
      },
      webcrackReports: {
        "shielded:stable": {
          suggestedWebcrackRating: "parse-fail / only-loader",
          summary: "loader only",
        },
      },
    });

    assert.equal(report.status, "attention");
    assert.equal(report.nextAction, "collect-a2-m3-guided-evidence");
    assert.equal(report.candidates[0].recommendedAction, "collect-a2-m3-guided-evidence");
    assert.equal(report.candidates[0].profileCoverage.guidedA2M3.meetsTarget, false);
  });

  it("should prioritize fixed guided coverage collection for current candidates before candidate probing", () => {
    const report = summarizePackageProtectionAttackReport({
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
            webcrackInitialResult: null,
            llmSinglePassResult: null,
          }),
        ],
      },
      guidedAggregateReport: {
        reports: [
          {
            generatedAt: "2026-04-18T01:00:00.000Z",
            variant: "encrypted",
            channel: "stable",
            guidedAttack: {
              rating: "high-level-architecture",
              resultTier: "R1",
              attackerTier: "A1",
              aiTier: "M1",
              attackMethod: "static-only",
              timeBucket: "<10m",
              roundMode: "single-pass",
            },
            nextAction: "probe-candidate-hardening",
          },
        ],
      },
    });

    assert.equal(report.candidates[0].profileCoverage.guidedA2M3.meetsTarget, false);
    assert.equal(report.candidates[0].recommendedAction, "collect-a2-m3-guided-evidence");
  });

  it("should include control candidates in the attack report without affecting the main verdict", () => {
    const report = summarizePackageProtectionAttackReport({
      registry: {
        schemaVersion: 1,
        candidates: [
          {
            id: "plain",
            class: "control",
            stage: "stage0",
            executionMode: "buildable-xpi",
            evaluationKind: "variant",
            variant: "plain",
            channel: "stable",
            artifactCoverage: ["smoke", "perf", "anchor-audit"],
            promotionGate: "control-only",
            status: "control",
            summary: "plain control",
          },
          {
            id: "shielded",
            class: "current",
            stage: "stage0",
            executionMode: "buildable-xpi",
            evaluationKind: "variant",
            variant: "shielded",
            channel: "stable",
            artifactCoverage: ["smoke", "webcrack", "guided-attack"],
            promotionGate: "keep-current-shielded",
            status: "current-primary",
            summary: "shielded current",
          },
        ],
      },
      smokeAggregate: {
        reports: [
          buildSmokeReport({
            variant: "plain",
            webcrackInitialResult: "parse-fail / only-loader",
            llmSinglePassResult: "readable-module-recovery",
          }),
          buildSmokeReport({
            variant: "shielded",
            webcrackInitialResult: "parse-fail / only-loader",
            llmSinglePassResult: "high-level-architecture",
          }),
        ],
      },
      guidedAggregateReport: {
        reports: [
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
              timeBucket: "30-120m",
              roundMode: "multi-round",
            },
            comparison: {
              relation: "same-as-single-pass-llm",
            },
            nextAction: "keep-current-shielded",
          },
        ],
      },
      webcrackReports: {
        "plain:stable": {
          suggestedWebcrackRating: "parse-fail / only-loader",
          summary: "loader only",
        },
        "shielded:stable": {
          suggestedWebcrackRating: "parse-fail / only-loader",
          summary: "loader only",
        },
      },
    });

    assert.equal(report.status, "passed");
    assert.equal(report.nextAction, "keep-current-shielded");

    const plain = report.candidates.find((candidate) => candidate.id === "plain");
    assert.ok(plain);
    assert.equal(plain.class, "control");
    assert.equal(plain.profileCoverage.singlePassAutomation.complete, true);
    assert.equal(plain.profileCoverage.singlePassAutomation.rating, "readable-module-recovery");
    assert.equal(plain.attack.webcrackRating, "parse-fail / only-loader");
    assert.equal(plain.attack.llmSinglePassRating, "readable-module-recovery");
    assert.equal(plain.recommendedAction, "control-only");
  });

  it("should persist attack report artifacts", async () => {
    const projectRootPath = fs.mkdtempSync(path.join(os.tmpdir(), "package-protection-attack-"));
    try {
      const report = summarizePackageProtectionAttackReport({
        registry: {
          schemaVersion: 1,
          candidates: [],
        },
      });
      const paths = await persistPackageProtectionAttackReport(report, {
        projectRootPath,
      });
      assert.ok(fs.existsSync(paths.reportPath));
      assert.ok(fs.existsSync(paths.reportMDPath));
      const markdown = fs.readFileSync(paths.reportMDPath, "utf-8");
      assert.ok(markdown.includes("Package Protection Attack Report"));
    } finally {
      fs.rmSync(projectRootPath, { recursive: true, force: true });
    }
  });
});
