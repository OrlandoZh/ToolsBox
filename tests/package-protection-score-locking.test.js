import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  summarizePackageProtectionSmokeReport,
  withPackageProtectionWorkflowLock,
} from "../scripts/package-protection-smoke.mjs";
import { recordPackageProtectionLLMScore } from "../scripts/package-protection-llm-score.mjs";
import { recordPackageProtectionWebcrackScore } from "../scripts/package-protection-webcrack-score.mjs";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function writeWebcrackReport(projectRoot, { variant = "shielded", channel = "stable", suggestedWebcrackRating = "parse-fail / only-loader" } = {}) {
  const archiveDir = path.join(projectRoot, "dist", "package-protection-webcrack");
  fs.mkdirSync(archiveDir, { recursive: true });
  fs.writeFileSync(path.join(archiveDir, `${variant}-${channel}.json`), `${JSON.stringify({
    generatedAt: "2026-04-16T01:00:00.000Z",
    variant,
    channel,
    status: "passed",
    suggestedWebcrackRating,
  }, null, 2)}\n`, "utf-8");
}

describe("Package Protection Score Locking", () => {
  it("should serialize concurrent in-process package protection workflow calls", async () => {
    const events = [];
    let activeCount = 0;
    let maxActiveCount = 0;

    await Promise.all([
      withPackageProtectionWorkflowLock("package-protection-score-locking-test-a", async () => {
        activeCount += 1;
        maxActiveCount = Math.max(maxActiveCount, activeCount);
        events.push("a:start");
        await sleep(30);
        events.push("a:end");
        activeCount -= 1;
      }),
      withPackageProtectionWorkflowLock("package-protection-score-locking-test-b", async () => {
        activeCount += 1;
        maxActiveCount = Math.max(maxActiveCount, activeCount);
        events.push("b:start");
        await sleep(5);
        events.push("b:end");
        activeCount -= 1;
      }),
    ]);

    assert.equal(maxActiveCount, 1, "package protection workflow calls should not overlap in the same process");
    assert.deepEqual(events, ["a:start", "a:end", "b:start", "b:end"]);
  });

  it("should keep the smoke aggregate coherent when webcrack and llm scores are recorded concurrently", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "package-protection-score-locking-"));
    const shieldedStable = buildSampleSmokeReport({ variant: "shielded", channel: "stable" });
    const shieldedBeta = buildSampleSmokeReport({ variant: "shielded", channel: "beta" });

    try {
      writeSmokeAggregate(projectRoot, [shieldedBeta, shieldedStable]);
      writeWebcrackReport(projectRoot, {
        variant: "shielded",
        channel: "stable",
      });

      await Promise.all([
        recordPackageProtectionWebcrackScore({
          projectRootPath: projectRoot,
          variant: "shielded",
          channel: "stable",
        }),
        recordPackageProtectionLLMScore({
          projectRootPath: projectRoot,
          variant: "shielded",
          channel: "stable",
          llm: "high-level-architecture",
          completedAt: "2026-04-16T06:00:00.000Z",
        }),
      ]);

      const aggregate = JSON.parse(fs.readFileSync(
        path.join(projectRoot, "dist", "package-protection-smoke.json"),
        "utf-8",
      ));
      const report = JSON.parse(fs.readFileSync(
        path.join(projectRoot, "dist", "package-protection-smoke", "shielded-stable.json"),
        "utf-8",
      ));

      assert.equal(aggregate.reports.length, 2);
      assert.equal(report.manualScorecard.webcrackInitialResult, "parse-fail / only-loader");
      assert.equal(report.manualScorecard.llmSinglePassResult, "high-level-architecture");
      assert.equal(report.manualScorecard.status, "completed");
      assert.ok(typeof report.manualScorecard.completedAt === "string" && report.manualScorecard.completedAt.length > 0);
      assert.equal(
        aggregate.reports.find((item) => item.variant === "shielded" && item.channel === "stable")?.manualScorecard?.status,
        "completed",
      );
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
