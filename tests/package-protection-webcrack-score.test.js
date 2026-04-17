import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  parsePackageProtectionWebcrackScoreArgs,
  recordPackageProtectionWebcrackScore,
} from "../scripts/package-protection-webcrack-score.mjs";
import { summarizePackageProtectionSmokeReport } from "../scripts/package-protection-smoke.mjs";

function buildSampleSmokeReport({ variant = "shielded", channel = "stable", llm = null } = {}) {
  const report = summarizePackageProtectionSmokeReport({
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
  if (llm) {
    report.manualScorecard = {
      ...report.manualScorecard,
      webcrackInitialResult: null,
      llmSinglePassResult: llm,
      status: "pending",
      completedAt: null,
    };
  }
  return report;
}

function writeSmokeAggregate(projectRoot, reports) {
  const distRoot = path.join(projectRoot, "dist");
  fs.mkdirSync(distRoot, { recursive: true });
  fs.writeFileSync(path.join(distRoot, "package-protection-smoke.json"), `${JSON.stringify({
    generatedAt: "2026-04-17T00:00:00.000Z",
    reports,
  }, null, 2)}\n`, "utf-8");
}

function writeWebcrackReport(projectRoot, { variant, channel, suggestedWebcrackRating }) {
  const distRoot = path.join(projectRoot, "dist", "package-protection-webcrack");
  fs.mkdirSync(distRoot, { recursive: true });
  fs.writeFileSync(path.join(distRoot, `${variant}-${channel}.json`), `${JSON.stringify({
    generatedAt: "2026-04-17T00:10:00.000Z",
    advisory: true,
    variant,
    channel,
    status: "passed",
    suggestedWebcrackRating,
  }, null, 2)}\n`, "utf-8");
}

describe("Package Protection Webcrack Score", () => {
  it("should parse required args and optional override", () => {
    const options = parsePackageProtectionWebcrackScoreArgs([
      "--variant", "shielded",
      "--channel", "stable",
      "--webcrack", "parse-fail / only-loader",
    ]);

    assert.equal(options.variant, "shielded");
    assert.equal(options.channel, "stable");
    assert.equal(options.webcrack, "parse-fail / only-loader");
  });

  it("should reject missing variant or channel", () => {
    assert.throws(() => parsePackageProtectionWebcrackScoreArgs([
      "--channel", "stable",
    ]));
    assert.throws(() => parsePackageProtectionWebcrackScoreArgs([
      "--variant", "shielded",
    ]));
  });

  it("should write back only the webcrack half when llm score is still missing", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "package-protection-webcrack-score-"));
    const shieldedStable = buildSampleSmokeReport({ variant: "shielded", channel: "stable" });

    try {
      writeSmokeAggregate(projectRoot, [shieldedStable]);
      writeWebcrackReport(projectRoot, {
        variant: "shielded",
        channel: "stable",
        suggestedWebcrackRating: "parse-fail / only-loader",
      });

      const { report, paths, webcrackReportPath } = await recordPackageProtectionWebcrackScore({
        projectRootPath: projectRoot,
        variant: "shielded",
        channel: "stable",
      });

      const updatedReport = JSON.parse(fs.readFileSync(paths.reportPath, "utf-8"));
      const updatedAggregate = JSON.parse(fs.readFileSync(path.join(projectRoot, "dist", "package-protection-smoke.json"), "utf-8"));

      assert.ok(String(webcrackReportPath || "").endsWith("shielded-stable.json"));
      assert.equal(report.manualScorecard.webcrackInitialResult, "parse-fail / only-loader");
      assert.equal(report.manualScorecard.llmSinglePassResult, null);
      assert.equal(report.manualScorecard.status, "pending");
      assert.equal(report.manualScorecard.completedAt, null);
      assert.equal(updatedReport.manualScorecard.webcrackInitialResult, "parse-fail / only-loader");
      assert.equal(updatedAggregate.reports[0].manualScorecard.webcrackInitialResult, "parse-fail / only-loader");
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("should complete the manual score when llm score already exists", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "package-protection-webcrack-score-"));
    const shieldedStable = buildSampleSmokeReport({
      variant: "shielded",
      channel: "stable",
      llm: "high-level-architecture",
    });

    try {
      writeSmokeAggregate(projectRoot, [shieldedStable]);
      writeWebcrackReport(projectRoot, {
        variant: "shielded",
        channel: "stable",
        suggestedWebcrackRating: "high-level-architecture",
      });

      const { report } = await recordPackageProtectionWebcrackScore({
        projectRootPath: projectRoot,
        variant: "shielded",
        channel: "stable",
        completedAt: "2026-04-17T01:00:00.000Z",
      });

      assert.equal(report.manualScorecard.webcrackInitialResult, "high-level-architecture");
      assert.equal(report.manualScorecard.llmSinglePassResult, "high-level-architecture");
      assert.equal(report.manualScorecard.status, "completed");
      assert.equal(report.manualScorecard.completedAt, "2026-04-17T01:00:00.000Z");
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
