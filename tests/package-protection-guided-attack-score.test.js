import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  buildPackageProtectionGuidedAttackProfileKey,
  parsePackageProtectionGuidedAttackScoreArgs,
  recordPackageProtectionGuidedAttack,
} from "../scripts/package-protection-guided-attack-score.mjs";
import { summarizePackageProtectionSmokeReport } from "../scripts/package-protection-smoke.mjs";

function buildSampleSmokeReport({
  variant = "shielded",
  channel = "stable",
  webcrackInitialResult = "parse-fail / only-loader",
  llmSinglePassResult = "parse-fail / only-loader",
} = {}) {
  const report = summarizePackageProtectionSmokeReport({
    variant,
    channel,
    repeats: 1,
    xpi: {
      path: `/tmp/${variant}-${channel}.xpi`,
      sizeBytes: 1234,
    },
    bundle: {
      path: `/tmp/${variant}-${channel}.js`,
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
        runIndex: 1,
        passed: true,
        status: "passed",
        statusLabel: "通过",
        readinessMode: "native",
        apiReady: true,
        blockingRuntimeErrorCount: 0,
        hostNoiseErrorCount: 0,
        base64Support: {
          fromBase64Available: true,
          setFromBase64Available: true,
        },
        packageProtection: {
          variant,
          decodeMethod: "fromBase64",
          decodeDurationMs: 24,
          prepareDurationMs: 69,
          bootstrapResolveDurationMs: 69,
        },
        issues: [],
      },
    ],
  });

  report.manualScorecard.webcrackInitialResult = webcrackInitialResult;
  report.manualScorecard.llmSinglePassResult = llmSinglePassResult;
  report.manualScorecard.status = webcrackInitialResult && llmSinglePassResult ? "completed" : "pending";
  report.manualScorecard.completedAt = report.manualScorecard.status === "completed"
    ? "2026-04-17T18:00:00.000Z"
    : null;
  return report;
}

function writeSmokeAggregate(projectRoot, reports) {
  const distRoot = path.join(projectRoot, "dist");
  fs.mkdirSync(distRoot, { recursive: true });
  fs.writeFileSync(path.join(distRoot, "package-protection-smoke.json"), `${JSON.stringify({
    generatedAt: "2026-04-17T18:00:00.000Z",
    reports,
  }, null, 2)}\n`, "utf-8");
}

describe("Package Protection Guided Attack Score", () => {
  it("should build a stable profile key from the attacker profile", () => {
    const profileKey = buildPackageProtectionGuidedAttackProfileKey({
      attackerTier: "A1",
      aiTier: "M1",
      attackMethod: "static-only",
      timeBucket: "<10m",
      roundMode: "single-pass",
    });

    assert.equal(profileKey, "a1__m1__static-only__single-pass__lt10m");
  });

  it("should parse required args and repeated evidence files", () => {
    const options = parsePackageProtectionGuidedAttackScoreArgs([
      "--variant", "shielded",
      "--channel", "stable",
      "--rating", "high-level-architecture",
      "--result-tier", "R1",
      "--attacker-tier", "A2",
      "--ai-tier", "M3",
      "--attack-method", "static+reference",
      "--time-bucket", "30-120m",
      "--round-mode", "multi-round",
      "--summary", "Recovered lifecycle facade",
      "--evidence-file", "/tmp/a.md",
      "--evidence-file", "/tmp/b.js",
    ]);

    assert.equal(options.variant, "shielded");
    assert.equal(options.channel, "stable");
    assert.equal(options.rating, "high-level-architecture");
    assert.equal(options.resultTier, "R1");
    assert.equal(options.attackerTier, "A2");
    assert.equal(options.aiTier, "M3");
    assert.equal(options.attackMethod, "static+reference");
    assert.equal(options.timeBucket, "30-120m");
    assert.equal(options.roundMode, "multi-round");
    assert.equal(options.summary, "Recovered lifecycle facade");
    assert.equal(options.evidenceFiles.length, 2);
  });

  it("should accept legacy attack-path and cost-bucket aliases", () => {
    const options = parsePackageProtectionGuidedAttackScoreArgs([
      "--variant", "shielded",
      "--channel", "stable",
      "--rating", "high-level-architecture",
      "--result-tier", "R1",
      "--attacker-tier", "A2",
      "--ai-tier", "M3",
      "--attack-path", "static+webcrack+reference",
      "--cost-bucket", "30-120m",
      "--round-mode", "multi-round",
      "--summary", "Recovered lifecycle facade",
    ]);

    assert.equal(options.attackMethod, "static+reference");
    assert.equal(options.timeBucket, "30-120m");
    assert.equal(options.roundMode, "multi-round");
  });

  it("should reject invalid rating and missing summary", () => {
    assert.throws(() => parsePackageProtectionGuidedAttackScoreArgs([
      "--variant", "shielded",
      "--channel", "stable",
      "--rating", "invalid",
      "--result-tier", "R1",
      "--attacker-tier", "A2",
      "--ai-tier", "M3",
      "--attack-method", "static+reference",
      "--time-bucket", "30-120m",
      "--round-mode", "multi-round",
      "--summary", "summary",
    ]));
    assert.throws(() => parsePackageProtectionGuidedAttackScoreArgs([
      "--variant", "shielded",
      "--channel", "stable",
      "--rating", "high-level-architecture",
      "--result-tier", "R1",
      "--attacker-tier", "A2",
      "--ai-tier", "M3",
      "--attack-method", "static+reference",
      "--time-bucket", "30-120m",
    ]));
  });

  it("should persist a guided attack report without mutating smoke scorecards", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "package-protection-guided-attack-"));
    const evidenceA = path.join(projectRoot, "attack-session.md");
    const evidenceB = path.join(projectRoot, "reparsed.js");
    const shieldedStable = buildSampleSmokeReport({
      variant: "shielded",
      channel: "stable",
      webcrackInitialResult: "parse-fail / only-loader",
      llmSinglePassResult: "parse-fail / only-loader",
    });

    try {
      fs.writeFileSync(evidenceA, "# attack session\n", "utf-8");
      fs.writeFileSync(evidenceB, "export const recovered = true;\n", "utf-8");
      writeSmokeAggregate(projectRoot, [shieldedStable]);

      const { report, paths } = await recordPackageProtectionGuidedAttack({
        projectRootPath: projectRoot,
        variant: "shielded",
        channel: "stable",
        rating: "high-level-architecture",
        resultTier: "R1",
        attackerTier: "A2",
        aiTier: "M3",
        attackMethod: "static+reference",
        timeBucket: "30-120m",
        roundMode: "multi-round",
        summary: "Recovered lifecycle facade and service assembly",
        notes: "Requires reference project and multi-round prompting",
        evidenceFiles: [evidenceA, evidenceB],
        generatedAt: "2026-04-17T19:00:00.000Z",
      });

      const aggregate = JSON.parse(fs.readFileSync(
        path.join(projectRoot, "dist", "package-protection-guided-attack.json"),
        "utf-8",
      ));
      const storedReport = JSON.parse(fs.readFileSync(paths.reportPath, "utf-8"));
      const markdown = fs.readFileSync(paths.reportMDPath, "utf-8");
      const smokeAggregate = JSON.parse(fs.readFileSync(
        path.join(projectRoot, "dist", "package-protection-smoke.json"),
        "utf-8",
      ));

      assert.ok(paths.reportPath.endsWith("shielded-stable-a2__m3__static-reference__multi-round__30-120m.json"));
      assert.equal(paths.aliasUpdated, true);
      assert.equal(report.profileKey, "a2__m3__static-reference__multi-round__30-120m");
      assert.equal(report.guidedAttack.rating, "high-level-architecture");
      assert.equal(report.guidedAttack.resultTier, "R1");
      assert.equal(report.guidedAttack.attackerTier, "A2");
      assert.equal(report.guidedAttack.aiTier, "M3");
      assert.equal(report.guidedAttack.attackMethod, "static+reference");
      assert.equal(report.guidedAttack.attackPath, "static+reference");
      assert.equal(report.guidedAttack.timeBucket, "30-120m");
      assert.equal(report.guidedAttack.costBucket, "30-120m");
      assert.equal(report.guidedAttack.roundMode, "multi-round");
      assert.equal(report.comparison.relation, "stronger-than-single-pass-llm");
      assert.equal(report.nextAction, "probe-candidate-hardening");
      assert.equal(report.guidedAttack.evidenceFiles.length, 2);
      assert.equal(storedReport.guidedAttack.notes, "Requires reference project and multi-round prompting");
      assert.equal(aggregate.reports.length, 1);
      assert.equal(aggregate.reports[0].profileKey, "a2__m3__static-reference__multi-round__30-120m");
      assert.ok(markdown.includes("attackMethod"));
      assert.ok(markdown.includes("roundMode"));
      assert.ok(markdown.includes("profileKey"));
      assert.ok(markdown.includes("stronger-than-single-pass-llm"));
      assert.ok(markdown.includes("Recovered lifecycle facade and service assembly"));
      assert.equal(smokeAggregate.reports[0].manualScorecard.llmSinglePassResult, "parse-fail / only-loader");
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("should preserve distinct guided-attack profiles for the same variant/channel", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "package-protection-guided-attack-multi-"));
    const shieldedStable = buildSampleSmokeReport({
      variant: "shielded",
      channel: "stable",
      webcrackInitialResult: "parse-fail / only-loader",
      llmSinglePassResult: "high-level-architecture",
    });

    try {
      writeSmokeAggregate(projectRoot, [shieldedStable]);

      const first = await recordPackageProtectionGuidedAttack({
        projectRootPath: projectRoot,
        variant: "shielded",
        channel: "stable",
        rating: "high-level-architecture",
        resultTier: "R1",
        attackerTier: "A2",
        aiTier: "M3",
        attackMethod: "static+reference",
        timeBucket: "30-120m",
        roundMode: "multi-round",
        summary: "guided multi-round review",
        notes: "reference-assisted baseline",
        generatedAt: "2026-04-17T19:00:00.000Z",
      });
      const second = await recordPackageProtectionGuidedAttack({
        projectRootPath: projectRoot,
        variant: "shielded",
        channel: "stable",
        rating: "high-level-architecture",
        resultTier: "R1",
        attackerTier: "A1",
        aiTier: "M1",
        attackMethod: "static-only",
        timeBucket: "<10m",
        roundMode: "single-pass",
        summary: "single-pass static read only recovered architecture",
        notes: "fresh-xpi subagent replay",
        generatedAt: "2026-04-18T03:00:00.000Z",
      });

      const aggregate = JSON.parse(fs.readFileSync(
        path.join(projectRoot, "dist", "package-protection-guided-attack.json"),
        "utf-8",
      ));
      const legacyAlias = JSON.parse(fs.readFileSync(
        path.join(projectRoot, "dist", "package-protection-guided-attack", "shielded-stable.json"),
        "utf-8",
      ));

      assert.equal(first.paths.aliasUpdated, true);
      assert.equal(second.paths.aliasUpdated, false);
      assert.equal(aggregate.reports.length, 2);
      assert.equal(aggregate.reports[0].profileKey, "a1__m1__static-only__single-pass__lt10m");
      assert.equal(aggregate.reports[1].profileKey, "a2__m3__static-reference__multi-round__30-120m");
      assert.equal(legacyAlias.profileKey, "a2__m3__static-reference__multi-round__30-120m");
      assert.ok(fs.existsSync(path.join(
        projectRoot,
        "dist",
        "package-protection-guided-attack",
        "shielded-stable-a1__m1__static-only__single-pass__lt10m.json",
      )));
      assert.ok(fs.existsSync(path.join(
        projectRoot,
        "dist",
        "package-protection-guided-attack",
        "shielded-stable-a2__m3__static-reference__multi-round__30-120m.json",
      )));
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
