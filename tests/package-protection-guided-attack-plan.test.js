import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  parsePackageProtectionGuidedAttackPlanArgs,
  persistPackageProtectionGuidedAttackPlan,
  summarizePackageProtectionGuidedAttackPlan,
} from "../scripts/package-protection-guided-attack-plan.mjs";

describe("Package Protection Guided Attack Plan", () => {
  it("should parse default guided attack plan args", () => {
    const options = parsePackageProtectionGuidedAttackPlanArgs([]);
    assert.ok(options.projectRootPath.endsWith("AddonTemplate4Z"));
    assert.ok(options.registryPath.endsWith(path.join("config", "package-protection-candidates.json")));
  });

  it("should request refreshing attack artifacts when attack report is missing", () => {
    const registry = {
      schemaVersion: 1,
      candidates: [
        {
          id: "shielded",
          class: "current",
          stage: "stage0",
          variant: "shielded",
          channel: "stable",
        },
      ],
    };

    const report = summarizePackageProtectionGuidedAttackPlan({
      registry,
      attackReport: null,
      matrixReport: null,
      smokeAggregate: null,
    });

    assert.equal(report.status, "missing");
    assert.equal(report.nextAction, "refresh-attack-report");
    assert.equal(report.tasks.length, 1);
    assert.equal(report.tasks[0].kind, "refresh-attack-report");
    assert.deepEqual(report.tasks[0].commands, [
      "npm run package:protection:attack",
      "npm run package:protection:matrix",
    ]);
  });

  it("should prioritize current fixed-profile gaps before experiment review tasks", () => {
    const registry = {
      schemaVersion: 1,
      candidates: [
        {
          id: "encrypted",
          class: "current",
          stage: "stage0",
          variant: "encrypted",
          channel: "stable",
          artifactCoverage: ["smoke", "perf", "guided-attack", "verdict"],
          promotionGate: "keep-low-overhead-baseline",
          status: "current-baseline",
          summary: "encrypted baseline",
        },
        {
          id: "shielded",
          class: "current",
          stage: "stage0",
          variant: "shielded",
          channel: "stable",
          artifactCoverage: ["smoke", "perf", "webcrack", "guided-attack", "verdict"],
          promotionGate: "keep-current-shielded",
          status: "current-primary",
          summary: "shielded current",
        },
        {
          id: "shielded-pref-bridge",
          class: "experiment",
          stage: "stage2-static-surface",
          compareVariant: "shielded-pref-bridge",
          channel: "stable",
          artifactCoverage: ["smoke", "perf", "webcrack", "guided-attack", "compare"],
          promotionGate: "hardening-win-only",
          status: "promoted-hardening-candidate",
          summary: "pref bridge compare",
        },
      ],
    };

    const attackReport = {
      generatedAt: "2026-04-18T12:00:00.000Z",
      status: "passed",
      nextAction: "review-experimental-hardening",
      candidates: [
        {
          id: "encrypted",
          class: "current",
          variant: "encrypted",
          channel: "stable",
          recommendedAction: "collect-a2-m3-guided-evidence",
          summary: "encrypted still lacks fixed profile coverage",
          profileCoverage: {
            singlePassAutomation: {
              complete: false,
            },
            guidedA2M3: {
              meetsTarget: false,
            },
          },
          attack: {
            webcrackRating: null,
            llmSinglePassRating: null,
            guidedAttack: {
              attackerTier: "A1",
              aiTier: "M1",
              attackMethod: "static-only",
              roundMode: "single-pass",
              timeBucket: "<10m",
            },
          },
        },
        {
          id: "shielded",
          class: "current",
          variant: "shielded",
          channel: "stable",
          recommendedAction: "probe-candidate-hardening",
          summary: "shielded coverage complete",
          profileCoverage: {
            singlePassAutomation: {
              complete: true,
            },
            guidedA2M3: {
              meetsTarget: true,
            },
          },
          attack: {
            webcrackRating: "parse-fail / only-loader",
            llmSinglePassRating: "high-level-architecture",
            guidedAttack: {
              attackerTier: "A2",
              aiTier: "M3",
              attackMethod: "static+reference",
              roundMode: "multi-round",
              timeBucket: "30-120m",
            },
          },
        },
        {
          id: "shielded-pref-bridge",
          class: "experiment",
          variant: "shielded-pref-bridge",
          channel: "stable",
          recommendedAction: "promote-experimental-candidate",
          summary: "pref bridge is ready for review",
          profileCoverage: {
            singlePassAutomation: {
              complete: true,
            },
            guidedA2M3: {
              meetsTarget: true,
            },
          },
          attack: {
            webcrackRating: "parse-fail / only-loader",
            llmSinglePassRating: "parse-fail / only-loader",
          },
        },
      ],
    };

    const matrixReport = {
      candidates: [
        {
          id: "encrypted",
          recommendedAction: "collect-a2-m3-guided-evidence",
          signals: {
            verdictRole: "required-baseline",
          },
        },
        {
          id: "shielded",
          recommendedAction: "probe-candidate-hardening",
          signals: {
            verdictRole: "required-primary",
          },
        },
        {
          id: "shielded-pref-bridge",
          recommendedAction: "promote-experimental-candidate",
          summary: "pref bridge keeps resistance and shrinks support surface",
        },
      ],
    };

    const smokeAggregate = {
      reports: [
        {
          variant: "encrypted",
          channel: "stable",
          status: "passed",
        },
        {
          variant: "shielded",
          channel: "stable",
          status: "passed",
        },
      ],
    };

    const report = summarizePackageProtectionGuidedAttackPlan({
      registry,
      attackReport,
      matrixReport,
      smokeAggregate,
    });

    assert.equal(report.status, "attention");
    assert.equal(report.nextAction, "collect-current-fixed-profile-evidence");
    assert.equal(report.counters.taskCount, 3);
    assert.equal(report.counters.currentGapCount, 2);
    assert.equal(report.counters.reviewCount, 1);
    assert.equal(report.tasks[0].candidateId, "encrypted");
    assert.equal(report.tasks[0].kind, "collect-single-pass-automation-evidence");
    assert.ok(report.tasks[0].commands.includes("npm run package:protection:webcrack -- --variant encrypted --channel stable"));
    assert.ok(report.tasks[0].commands.includes("npm run package:protection:score:llm -- --variant encrypted --channel stable --llm \"<rating>\""));
    assert.equal(report.tasks[1].kind, "collect-guided-a2-m3-evidence");
    assert.ok(report.tasks[1].commands[0].includes("--attacker-tier A2 --ai-tier M3"));
    assert.equal(report.tasks[2].candidateId, "shielded-pref-bridge");
    assert.equal(report.tasks[2].kind, "review-experimental-hardening");
    assert.ok(report.tasks[2].commands.includes("npm run package:protection:compare -- --variant shielded-pref-bridge --channel stable"));
  });

  it("should switch to experiment review when current gaps are closed", () => {
    const registry = {
      schemaVersion: 1,
      candidates: [
        {
          id: "shielded",
          class: "current",
          stage: "stage0",
          variant: "shielded",
          channel: "stable",
        },
        {
          id: "shielded-pref-bridge",
          class: "experiment",
          stage: "stage2-static-surface",
          compareVariant: "shielded-pref-bridge",
          channel: "stable",
        },
      ],
    };

    const attackReport = {
      candidates: [
        {
          id: "shielded",
          class: "current",
          variant: "shielded",
          channel: "stable",
          profileCoverage: {
            singlePassAutomation: {
              complete: true,
            },
            guidedA2M3: {
              meetsTarget: true,
            },
          },
          attack: {
            webcrackRating: "parse-fail / only-loader",
            llmSinglePassRating: "high-level-architecture",
            guidedAttack: {
              attackerTier: "A2",
              aiTier: "M3",
              attackMethod: "static+reference",
              roundMode: "multi-round",
              timeBucket: "30-120m",
            },
          },
        },
        {
          id: "shielded-pref-bridge",
          class: "experiment",
          variant: "shielded-pref-bridge",
          channel: "stable",
          recommendedAction: "promote-experimental-candidate",
          profileCoverage: {
            singlePassAutomation: {
              complete: true,
            },
            guidedA2M3: {
              meetsTarget: true,
            },
          },
          attack: {
            webcrackRating: "parse-fail / only-loader",
            llmSinglePassRating: "parse-fail / only-loader",
          },
        },
      ],
    };

    const matrixReport = {
      candidates: [
        {
          id: "shielded-pref-bridge",
          recommendedAction: "promote-experimental-candidate",
          summary: "pref bridge keeps resistance and shrinks support surface",
        },
      ],
    };

    const report = summarizePackageProtectionGuidedAttackPlan({
      registry,
      attackReport,
      matrixReport,
      smokeAggregate: null,
    });

    assert.equal(report.status, "passed");
    assert.equal(report.nextAction, "review-experimental-hardening");
    assert.equal(report.counters.currentGapCount, 0);
    assert.equal(report.counters.reviewCount, 1);
    assert.equal(report.tasks[0].candidateId, "shielded-pref-bridge");
    assert.equal(report.reviewQueue.present, true);
    assert.equal(report.reviewQueue.topCandidateId, "shielded-pref-bridge");
  });

  it("should rank retained experiment review tasks by surface gain before costlier candidates", () => {
    const registry = {
      schemaVersion: 1,
      candidates: [
        {
          id: "shielded",
          class: "current",
          stage: "stage0",
          variant: "shielded",
          channel: "stable",
        },
        {
          id: "shielded-pref-bridge",
          class: "experiment",
          stage: "stage2-static-surface",
          compareVariant: "shielded-pref-bridge",
          channel: "stable",
        },
        {
          id: "shielded-surface-scrub",
          class: "experiment",
          stage: "stage2-static-surface",
          compareVariant: "shielded-surface-scrub",
          channel: "stable",
        },
      ],
    };

    const attackReport = {
      candidates: [
        {
          id: "shielded",
          class: "current",
          variant: "shielded",
          channel: "stable",
          profileCoverage: {
            singlePassAutomation: {
              complete: true,
            },
            guidedA2M3: {
              meetsTarget: true,
            },
          },
          attack: {
            webcrackRating: "parse-fail / only-loader",
            llmSinglePassRating: "high-level-architecture",
          },
        },
        {
          id: "shielded-pref-bridge",
          class: "experiment",
          variant: "shielded-pref-bridge",
          channel: "stable",
          recommendedAction: "promote-experimental-candidate",
          profileCoverage: {
            singlePassAutomation: {
              complete: true,
            },
            guidedA2M3: {
              meetsTarget: true,
            },
          },
          attack: {
            webcrackRating: "parse-fail / only-loader",
            llmSinglePassRating: "high-level-architecture",
          },
        },
        {
          id: "shielded-surface-scrub",
          class: "experiment",
          variant: "shielded-surface-scrub",
          channel: "stable",
          recommendedAction: "promote-experimental-candidate",
          profileCoverage: {
            singlePassAutomation: {
              complete: true,
            },
            guidedA2M3: {
              meetsTarget: true,
            },
          },
          attack: {
            webcrackRating: "parse-fail / only-loader",
            llmSinglePassRating: "high-level-architecture",
          },
        },
      ],
    };

    const matrixReport = {
      candidates: [
        {
          id: "shielded-pref-bridge",
          recommendedAction: "promote-experimental-candidate",
          summary: "pref bridge keeps resistance and shrinks support surface",
          signals: {
            compareStatus: "passed",
            compareDecision: "hardening-win",
            xpiDelta: 150813,
            prepareDelta: 5,
            decodeDelta: 1,
          },
        },
        {
          id: "shielded-surface-scrub",
          recommendedAction: "promote-experimental-candidate",
          summary: "surface scrub keeps resistance and shrinks support surface further",
          signals: {
            compareStatus: "passed",
            compareDecision: "hardening-win",
            xpiDelta: -50970,
            prepareDelta: -1,
            decodeDelta: -1,
          },
        },
      ],
    };

    const compareReports = {
      "shielded-pref-bridge": {
        status: "passed",
        decision: "hardening-win",
        auditComparison: {
          unpackedAnchorDeltaCount: -2,
          unpackedMatchDeltaCount: -8,
        },
        deltas: {
          xpiBytes: 150813,
          prepareDurationMs: 5,
          decodeDurationMs: 1,
          bundleBytes: 254540,
        },
      },
      "shielded-surface-scrub": {
        status: "passed",
        decision: "hardening-win",
        auditComparison: {
          unpackedAnchorDeltaCount: -14,
          unpackedMatchDeltaCount: -27,
        },
        deltas: {
          xpiBytes: -50970,
          prepareDurationMs: -1,
          decodeDurationMs: -1,
          bundleBytes: -88580,
        },
      },
    };

    const report = summarizePackageProtectionGuidedAttackPlan({
      registry,
      attackReport,
      matrixReport,
      smokeAggregate: null,
      compareReports,
    });

    assert.equal(report.status, "passed");
    assert.equal(report.nextAction, "review-experimental-hardening");
    assert.equal(report.counters.reviewCount, 2);
    assert.equal(report.reviewQueue.present, true);
    assert.equal(report.reviewQueue.topCandidateId, "shielded-surface-scrub");
    assert.equal(report.tasks[0].candidateId, "shielded-surface-scrub");
    assert.equal(report.tasks[0].reviewRank, 1);
    assert.equal(report.tasks[1].candidateId, "shielded-pref-bridge");
    assert.equal(report.tasks[1].reviewRank, 2);
    assert.equal(report.tasks[0].reviewPriority.unpackedAnchorDeltaCount, -14);
    assert.equal(report.tasks[1].reviewPriority.unpackedAnchorDeltaCount, -2);
  });

  it("should request experimental llm symmetry evidence before promotion review", () => {
    const registry = {
      schemaVersion: 1,
      candidates: [
        {
          id: "shielded",
          class: "current",
          stage: "stage0",
          variant: "shielded",
          channel: "stable",
        },
        {
          id: "shielded-surface-scrub",
          class: "experiment",
          stage: "stage2-static-surface",
          compareVariant: "shielded-surface-scrub",
          channel: "stable",
        },
      ],
    };

    const attackReport = {
      candidates: [
        {
          id: "shielded",
          class: "current",
          variant: "shielded",
          channel: "stable",
          profileCoverage: {
            singlePassAutomation: {
              complete: true,
            },
            guidedA2M3: {
              meetsTarget: true,
            },
          },
          attack: {
            webcrackRating: "parse-fail / only-loader",
            llmSinglePassRating: "high-level-architecture",
          },
        },
        {
          id: "shielded-surface-scrub",
          class: "experiment",
          variant: "shielded-surface-scrub",
          channel: "stable",
          recommendedAction: "collect-llm-symmetry-evidence",
          profileCoverage: {
            singlePassAutomation: {
              complete: false,
            },
            guidedA2M3: {
              meetsTarget: true,
            },
          },
          attack: {
            webcrackRating: "parse-fail / only-loader",
            llmSinglePassRating: null,
          },
        },
      ],
    };

    const matrixReport = {
      candidates: [
        {
          id: "shielded-surface-scrub",
          recommendedAction: "collect-llm-symmetry-evidence",
          summary: "surface scrub still needs llm symmetry before promotion",
          signals: {
            compareStatus: "passed",
            compareDecision: "hardening-win",
          },
        },
      ],
    };

    const compareReports = {
      "shielded-surface-scrub": {
        status: "passed",
        decision: "hardening-win",
      },
    };

    const report = summarizePackageProtectionGuidedAttackPlan({
      registry,
      attackReport,
      matrixReport,
      smokeAggregate: null,
      compareReports,
    });

    assert.equal(report.status, "attention");
    assert.equal(report.nextAction, "collect-experimental-symmetry-evidence");
    assert.equal(report.counters.currentGapCount, 0);
    assert.equal(report.counters.experimentGapCount, 1);
    assert.equal(report.counters.reviewCount, 0);
    assert.equal(report.reviewQueue.present, false);
    assert.equal(report.tasks[0].kind, "collect-experimental-llm-symmetry-evidence");
    assert.equal(report.tasks[0].candidateId, "shielded-surface-scrub");
    assert.equal(report.tasks[0].reviewRank, 1);
    assert.ok(report.tasks[0].commands.includes('npm run package:protection:score:llm -- --variant shielded-surface-scrub --channel stable --llm "<rating>"'));
  });

  it("should persist guided attack plan artifacts", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "package-protection-guided-plan-"));

    try {
      const report = {
        generatedAt: "2026-04-18T12:30:00.000Z",
        advisory: true,
        status: "attention",
        statusLabel: "关注",
        summary: "Need more current evidence",
        nextAction: "collect-current-fixed-profile-evidence",
        counters: {
          taskCount: 1,
          currentGapCount: 1,
          reviewCount: 0,
        },
        tasks: [
          {
            id: "encrypted-stable-single-pass",
            priority: "p0-current-gap",
            priorityLabel: "Current Gap",
            kind: "collect-single-pass-automation-evidence",
            candidateId: "encrypted",
            candidateClass: "current",
            variant: "encrypted",
            channel: "stable",
            role: "required-baseline",
            summary: "encrypted needs single-pass coverage",
            rationale: "webcrack and llm single-pass are still missing",
            commands: [
              "npm run package:protection:webcrack -- --variant encrypted --channel stable",
            ],
            missingCoverage: ["webcrack", "single-pass-llm"],
          },
        ],
      };

      const paths = await persistPackageProtectionGuidedAttackPlan(report, {
        projectRootPath: projectRoot,
      });
      const storedJSON = JSON.parse(fs.readFileSync(paths.reportPath, "utf-8"));
      const storedMD = fs.readFileSync(paths.reportMDPath, "utf-8");

      assert.equal(storedJSON.nextAction, "collect-current-fixed-profile-evidence");
      assert.ok(storedMD.includes("Package Protection Guided Attack Plan"));
      assert.ok(storedMD.includes("encrypted-stable-single-pass"));
      assert.ok(storedMD.includes("collect-single-pass-automation-evidence"));
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
