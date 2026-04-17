import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  parsePackageProtectionLLMScoreArgs,
  recordPackageProtectionLLMScore,
} from "../scripts/package-protection-llm-score.mjs";
import { summarizePackageProtectionSmokeReport } from "../scripts/package-protection-smoke.mjs";

function buildSampleSmokeReport({
  variant = "shielded-jsconfuser-string",
  channel = "stable",
  webcrackInitialResult = null,
} = {}) {
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
  report.manualScorecard.webcrackInitialResult = webcrackInitialResult;
  report.manualScorecard.status = webcrackInitialResult ? "pending" : "pending";
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

describe("Package Protection LLM Score", () => {
  it("should parse required args", () => {
    const options = parsePackageProtectionLLMScoreArgs([
      "--variant", "shielded-jsconfuser-string",
      "--channel", "stable",
      "--llm", "high-level-architecture",
    ]);

    assert.equal(options.variant, "shielded-jsconfuser-string");
    assert.equal(options.channel, "stable");
    assert.equal(options.llm, "high-level-architecture");
  });

  it("should reject invalid ratings and missing fields", () => {
    assert.throws(() => parsePackageProtectionLLMScoreArgs([
      "--variant", "shielded-jsconfuser-string",
      "--channel", "stable",
      "--llm", "invalid",
    ]));
    assert.throws(() => parsePackageProtectionLLMScoreArgs([
      "--variant", "shielded-jsconfuser-string",
      "--llm", "high-level-architecture",
    ]));
  });

  it("should preserve the webcrack rating and complete the scorecard when llm score is added", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "package-protection-llm-score-"));
    const targetReport = buildSampleSmokeReport({
      variant: "shielded-jsconfuser-string",
      channel: "stable",
      webcrackInitialResult: "parse-fail / only-loader",
    });

    try {
      writeSmokeAggregate(projectRoot, [targetReport]);

      const { report, paths, hadExistingWebcrackRating } = await recordPackageProtectionLLMScore({
        projectRootPath: projectRoot,
        variant: "shielded-jsconfuser-string",
        channel: "stable",
        llm: "high-level-architecture",
        completedAt: "2026-04-17T05:00:00.000Z",
      });

      const updatedAggregate = JSON.parse(fs.readFileSync(
        path.join(projectRoot, "dist", "package-protection-smoke.json"),
        "utf-8",
      ));
      const updatedReport = JSON.parse(fs.readFileSync(paths.reportPath, "utf-8"));

      assert.equal(hadExistingWebcrackRating, true);
      assert.equal(report.manualScorecard.webcrackInitialResult, "parse-fail / only-loader");
      assert.equal(report.manualScorecard.llmSinglePassResult, "high-level-architecture");
      assert.equal(report.manualScorecard.status, "completed");
      assert.equal(report.manualScorecard.completedAt, "2026-04-17T05:00:00.000Z");
      assert.equal(updatedReport.manualScorecard.status, "completed");
      assert.equal(updatedAggregate.reports[0].manualScorecard.llmSinglePassResult, "high-level-architecture");
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("should keep manual status pending when llm score is recorded before webcrack", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "package-protection-llm-score-pending-"));
    const targetReport = buildSampleSmokeReport({
      variant: "shielded-descriptor-bind",
      channel: "stable",
      webcrackInitialResult: null,
    });

    try {
      writeSmokeAggregate(projectRoot, [targetReport]);

      const { report, hadExistingWebcrackRating } = await recordPackageProtectionLLMScore({
        projectRootPath: projectRoot,
        variant: "shielded-descriptor-bind",
        channel: "stable",
        llm: "parse-fail / only-loader",
      });

      assert.equal(hadExistingWebcrackRating, false);
      assert.equal(report.manualScorecard.webcrackInitialResult, null);
      assert.equal(report.manualScorecard.llmSinglePassResult, "parse-fail / only-loader");
      assert.equal(report.manualScorecard.status, "pending");
      assert.equal(report.manualScorecard.completedAt, null);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
