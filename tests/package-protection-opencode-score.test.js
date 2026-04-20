import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  parsePackageProtectionOpencodeScoreArgs,
  recordPackageProtectionOpencodeScore,
} from "../scripts/package-protection-opencode-score.mjs";
import { summarizePackageProtectionSmokeReport } from "../scripts/package-protection-smoke.mjs";

function buildSampleSmokeReport({
  variant = "shielded",
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
          decodeDurationMs: 20,
          prepareDurationMs: 60,
          bootstrapResolveDurationMs: 60,
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
          decodeDurationMs: 19,
          prepareDurationMs: 58,
          bootstrapResolveDurationMs: 58,
        },
        issues: [],
      },
    ],
  });
  report.manualScorecard.webcrackInitialResult = webcrackInitialResult;
  report.manualScorecard.status = "pending";
  return report;
}

function writeSmokeAggregate(projectRoot, reports) {
  fs.mkdirSync(path.join(projectRoot, "dist"), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, "dist", "package-protection-smoke.json"), `${JSON.stringify({
    generatedAt: "2026-04-20T00:00:00.000Z",
    reports,
  }, null, 2)}\n`, "utf-8");
}

function writeOpencodeReport(projectRoot, { variant, channel, suggestedLLMRating }) {
  const archiveDir = path.join(projectRoot, "dist", "package-protection-opencode");
  fs.mkdirSync(archiveDir, { recursive: true });
  fs.writeFileSync(path.join(archiveDir, `${variant}-${channel}.json`), `${JSON.stringify({
    generatedAt: "2026-04-20T00:05:00.000Z",
    advisory: true,
    variant,
    channel,
    status: "passed",
    suggestedLLMRating,
  }, null, 2)}\n`, "utf-8");
}

describe("Package Protection Opencode Score", () => {
  it("should parse required args and optional override", () => {
    const options = parsePackageProtectionOpencodeScoreArgs([
      "--variant", "shielded",
      "--channel", "stable",
      "--llm", "parse-fail / only-loader",
    ]);

    assert.equal(options.variant, "shielded");
    assert.equal(options.channel, "stable");
    assert.equal(options.llm, "parse-fail / only-loader");

    const route4Options = parsePackageProtectionOpencodeScoreArgs([
      "--variant", "wasm-entitlement-legacy",
      "--channel", "stable",
      "--llm", "high-level-architecture",
    ]);
    assert.equal(route4Options.variant, "shielded-surface-scrub-wasm-entitlement-legacy");
  });

  it("should reject missing variant or channel", () => {
    assert.throws(() => parsePackageProtectionOpencodeScoreArgs([
      "--channel", "stable",
    ]));
    assert.throws(() => parsePackageProtectionOpencodeScoreArgs([
      "--variant", "shielded",
    ]));
  });

  it("should write back suggested llm rating from opencode report", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "package-protection-opencode-score-"));
    const targetReport = buildSampleSmokeReport({
      variant: "shielded",
      channel: "stable",
      webcrackInitialResult: "parse-fail / only-loader",
    });

    try {
      writeSmokeAggregate(projectRoot, [targetReport]);
      writeOpencodeReport(projectRoot, {
        variant: "shielded",
        channel: "stable",
        suggestedLLMRating: "high-level-architecture",
      });

      const { report, paths, opencodeReportPath } = await recordPackageProtectionOpencodeScore({
        projectRootPath: projectRoot,
        variant: "shielded",
        channel: "stable",
        completedAt: "2026-04-20T00:10:00.000Z",
      });

      const updatedAggregate = JSON.parse(fs.readFileSync(path.join(projectRoot, "dist", "package-protection-smoke.json"), "utf-8"));
      const updatedReport = JSON.parse(fs.readFileSync(paths.reportPath, "utf-8"));

      assert.ok(String(opencodeReportPath || "").endsWith("shielded-stable.json"));
      assert.equal(report.manualScorecard.webcrackInitialResult, "parse-fail / only-loader");
      assert.equal(report.manualScorecard.llmSinglePassResult, "high-level-architecture");
      assert.equal(report.manualScorecard.status, "completed");
      assert.equal(report.manualScorecard.completedAt, "2026-04-20T00:10:00.000Z");
      assert.equal(updatedAggregate.reports[0].manualScorecard.llmSinglePassResult, "high-level-architecture");
      assert.equal(updatedReport.manualScorecard.status, "completed");
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
