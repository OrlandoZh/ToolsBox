import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  parsePackageProtectionManualScoreArgs,
  recordPackageProtectionManualScore,
} from "../scripts/package-protection-manual-score.mjs";
import { summarizePackageProtectionSmokeReport } from "../scripts/package-protection-smoke.mjs";

function buildSampleSmokeReport({ variant = "shielded", channel = "stable" } = {}) {
  return summarizePackageProtectionSmokeReport({
    variant,
    channel,
    repeats: 2,
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
          decodeDurationMs: 25,
          prepareDurationMs: 70,
          bootstrapResolveDurationMs: 70,
        },
        issues: [],
      },
      {
        runIndex: 2,
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
}

function writeSmokeAggregate(projectRoot, reports) {
  const distRoot = path.join(projectRoot, "dist");
  fs.mkdirSync(distRoot, { recursive: true });
  fs.writeFileSync(path.join(distRoot, "package-protection-smoke.json"), `${JSON.stringify({
    generatedAt: "2026-04-16T00:00:00.000Z",
    reports,
  }, null, 2)}\n`, "utf-8");
}

describe("Package Protection Manual Score", () => {
  it("should parse required args", () => {
    const options = parsePackageProtectionManualScoreArgs([
      "--variant", "shielded",
      "--channel", "stable",
      "--webcrack", "high-level-architecture",
      "--llm", "parse-fail / only-loader",
    ]);

    assert.equal(options.variant, "shielded");
    assert.equal(options.channel, "stable");
    assert.equal(options.webcrack, "high-level-architecture");
    assert.equal(options.llm, "parse-fail / only-loader");

    const route4Options = parsePackageProtectionManualScoreArgs([
      "--variant", "wasm-entitlement-legacy",
      "--channel", "stable",
      "--webcrack", "high-level-architecture",
      "--llm", "high-level-architecture",
    ]);
    assert.equal(route4Options.variant, "shielded-surface-scrub-wasm-entitlement-legacy");
  });

  it("should reject invalid ratings and missing fields", () => {
    assert.throws(() => parsePackageProtectionManualScoreArgs([
      "--variant", "shielded",
      "--channel", "stable",
      "--webcrack", "invalid",
      "--llm", "high-level-architecture",
    ]));
    assert.throws(() => parsePackageProtectionManualScoreArgs([
      "--variant", "shielded",
      "--webcrack", "high-level-architecture",
      "--llm", "high-level-architecture",
    ]));
  });

  it("should write manual score back into the target report and aggregate artifacts", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "package-protection-manual-score-"));
    const shieldedStable = buildSampleSmokeReport({ variant: "shielded", channel: "stable" });
    const shieldedBeta = buildSampleSmokeReport({ variant: "shielded", channel: "beta" });

    try {
      writeSmokeAggregate(projectRoot, [shieldedBeta, shieldedStable]);

      const { report, paths } = await recordPackageProtectionManualScore({
        projectRootPath: projectRoot,
        variant: "shielded",
        channel: "stable",
        webcrack: "high-level-architecture",
        llm: "high-level-architecture",
        completedAt: "2026-04-16T05:00:00.000Z",
      });

      const updatedAggregate = JSON.parse(fs.readFileSync(
        path.join(projectRoot, "dist", "package-protection-smoke.json"),
        "utf-8",
      ));
      const updatedReport = JSON.parse(fs.readFileSync(paths.reportPath, "utf-8"));
      const reportMarkdown = fs.readFileSync(paths.reportMDPath, "utf-8");
      const aggregateMarkdown = fs.readFileSync(paths.aggregateMDPath, "utf-8");

      assert.equal(report.manualScorecard.status, "completed");
      assert.equal(report.manualScorecard.completedAt, "2026-04-16T05:00:00.000Z");
      assert.equal(updatedReport.manualScorecard.webcrackInitialResult, "high-level-architecture");
      assert.equal(updatedReport.manualScorecard.llmSinglePassResult, "high-level-architecture");
      assert.equal(updatedReport.manualScorecard.status, "completed");
      assert.equal(updatedAggregate.reports.length, 2);
      assert.equal(updatedAggregate.reports.find((item) => item.variant === "shielded" && item.channel === "stable")?.manualScorecard?.status, "completed");
      assert.ok(reportMarkdown.includes("high-level-architecture"));
      assert.ok(reportMarkdown.includes("`completed`"));
      assert.ok(aggregateMarkdown.includes("shielded/stable"));
      assert.ok(fs.existsSync(path.join(projectRoot, "dist", "package-protection-smoke", "shielded-stable.json")));
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
