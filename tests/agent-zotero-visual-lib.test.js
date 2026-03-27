import { describe, it, assert } from "./test-framework.js";
import {
  compareBitmapImages,
  evaluateVisualBaselineComparison,
  getVisualBaselineFilename,
  summarizeVisualCanonicalCoverage,
  summarizeVisualBaselineEntries,
} from "../scripts/agent-zotero-visual-lib.mjs";

function buildImage(width, height, pixels) {
  return {
    width,
    height,
    data: Uint8Array.from(pixels),
  };
}

describe("Agent Zotero Visual Lib", () => {
  it("should build stable visual baseline filenames", () => {
    assert.equal(
      getVisualBaselineFilename({
        bootMode: "hot-reload",
        kind: "reader",
      }),
      "hot-reload-reader.png",
    );
  });

  it("should compare bitmap images and report drift metrics", () => {
    const baseline = buildImage(2, 1, [
      0, 0, 0, 255,
      10, 10, 10, 255,
    ]);
    const actual = buildImage(2, 1, [
      0, 0, 0, 255,
      40, 40, 40, 255,
    ]);

    const metrics = compareBitmapImages(actual, baseline);
    assert.equal(metrics.sameDimensions, true);
    assert.equal(metrics.changedPixels, 1);
    assert.equal(metrics.comparedPixels, 2);
    assert.equal(metrics.changedRatio, 0.5);
    assert.equal(metrics.meanChannelDiff, 15);
  });

  it("should ignore tiny pixel drift below tolerance", () => {
    const baseline = buildImage(2, 1, [
      10, 10, 10, 255,
      20, 20, 20, 255,
    ]);
    const actual = buildImage(2, 1, [
      11, 11, 11, 255,
      25, 25, 25, 255,
    ]);

    const metrics = compareBitmapImages(actual, baseline, {
      pixelDiffTolerance: 1,
    });

    assert.equal(metrics.changedPixels, 1);
    assert.equal(metrics.changedRatio, 0.5);
  });

  it("should flag baseline drift when thresholds are exceeded", () => {
    const result = evaluateVisualBaselineComparison({
      kind: "reader",
      metrics: {
        sameDimensions: true,
        actualWidth: 100,
        actualHeight: 80,
        baselineWidth: 100,
        baselineHeight: 80,
        changedRatio: 0.2,
        meanChannelDiff: 12,
      },
    });

    assert.equal(result.ok, false);
    assert.ok(result.issues.some((item) => item.includes("像素漂移过大")));
    assert.ok(result.issues.some((item) => item.includes("平均通道差异过大")));
  });

  it("should summarize baseline entry states", () => {
    const summary = summarizeVisualBaselineEntries([
      { status: "compared", ok: true },
      { status: "compared", ok: false },
      { status: "missing" },
      { status: "created" },
      { status: "updated" },
      { status: "error" },
    ]);

    assert.deepEqual(summary, {
      total: 6,
      comparedCount: 2,
      missingCount: 1,
      createdCount: 1,
      updatedCount: 1,
      driftCount: 1,
      errorCount: 1,
    });
  });

  it("should summarize canonical baseline coverage states", () => {
    const partial = summarizeVisualCanonicalCoverage([
      { canonicalTarget: "restart-library.png", geometryMatched: true },
      { canonicalTarget: "restart-reader.png", geometryMatched: true },
      { canonicalTarget: "hot-reload-library.png", geometryMatched: false },
      { canonicalTarget: "hot-reload-reader.png", geometryMatched: false },
    ], [
      "restart-library.png",
      "restart-reader.png",
      "hot-reload-library.png",
      "hot-reload-reader.png",
    ]);

    assert.equal(partial.visualCanonicalCoverageKind, "partial");
    assert.ok(partial.visualCanonicalCoverageSummary.includes("hot-reload-library.png"));
    assert.ok(partial.visualCanonicalCoverageSummary.includes("hot-reload-reader.png"));

    const complete = summarizeVisualCanonicalCoverage([
      { canonicalTarget: "restart-library.png", geometryMatched: true },
      { canonicalTarget: "restart-reader.png", geometryMatched: true },
    ], [
      "restart-library.png",
      "restart-reader.png",
    ]);

    assert.equal(complete.visualCanonicalCoverageKind, "complete");

    const none = summarizeVisualCanonicalCoverage([
      { canonicalTarget: "restart-library.png", geometryMatched: false },
      { canonicalTarget: "restart-reader.png", geometryMatched: false },
    ], [
      "restart-library.png",
      "restart-reader.png",
    ]);

    assert.equal(none.visualCanonicalCoverageKind, "none");

    const unknown = summarizeVisualCanonicalCoverage([
      { canonicalTarget: "restart-library.png", geometryMatched: true },
    ], [
      "restart-library.png",
      "restart-reader.png",
    ]);

    assert.equal(unknown.visualCanonicalCoverageKind, "unknown");
  });
});
