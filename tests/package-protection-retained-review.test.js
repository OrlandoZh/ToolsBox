import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  persistPackageProtectionRetainedReview,
  summarizePackageProtectionRetainedReview,
} from "../scripts/package-protection-retained-review.mjs";

function buildCompareReport({
  variant,
  channel = "stable",
  status = "passed",
  decision = "hardening-win",
  nextAction = "promote-experimental-candidate",
  summary = "candidate compare",
  unpackedAnchorDeltaCount = -1,
  unpackedMatchDeltaCount = -2,
  residualFloorReached = false,
  residualExposedFiles = [],
  residualAnchorIds = [],
  xpiBytes = -1000,
  bundleBytes = -2000,
  decodeDurationMs = -1,
  prepareDurationMs = -1,
} = {}) {
  return {
    variant,
    channel,
    status,
    decision,
    nextAction,
    summary,
    auditComparison: {
      present: true,
      sameRawSurface: true,
      sameUnpackedSurface: false,
      rawAnchorDeltaCount: 0,
      rawMatchDeltaCount: 0,
      unpackedAnchorDeltaCount,
      unpackedMatchDeltaCount,
      residualFloorReached,
      residualExposedFiles,
      residualAnchorIds,
    },
    deltas: {
      xpiBytes,
      bundleBytes,
      decodeDurationMs,
      prepareDurationMs,
    },
  };
}

describe("Package Protection Retained Review", () => {
  it("should pick surface-scrub as the current top retained candidate", () => {
    const report = summarizePackageProtectionRetainedReview({
      guidedAttackPlanReport: {
        tasks: [
          {
            id: "shielded-surface-scrub-stable-review",
            kind: "review-experimental-hardening",
            candidateId: "shielded-surface-scrub",
            variant: "shielded-surface-scrub",
            channel: "stable",
            summary: "surface-scrub review",
            rationale: "surface-scrub rationale",
            reviewRank: 1,
            reviewPriority: {
              compareStatus: "passed",
              compareDecision: "hardening-win",
              unpackedAnchorDeltaCount: -14,
              unpackedMatchDeltaCount: -27,
              xpiDelta: -50970,
              prepareDelta: -1,
              decodeDelta: -1,
            },
          },
          {
            id: "shielded-pref-bridge-stable-review",
            kind: "review-experimental-hardening",
            candidateId: "shielded-pref-bridge",
            variant: "shielded-pref-bridge",
            channel: "stable",
            summary: "pref-bridge review",
            rationale: "pref-bridge rationale",
            reviewRank: 2,
            reviewPriority: {
              compareStatus: "passed",
              compareDecision: "hardening-win",
              unpackedAnchorDeltaCount: -2,
              unpackedMatchDeltaCount: -8,
              xpiDelta: 150813,
              prepareDelta: 5,
              decodeDelta: 1,
            },
          },
        ],
      },
      matrixReport: {
        candidates: [
          {
            id: "shielded",
            variant: "shielded",
            channel: "stable",
            recommendedAction: "probe-candidate-hardening",
            signals: {
              sourceProxyReducedAnchorCount: 48,
              sourceProxyReducedMatchCount: 172,
              unpackedSurfaceAnchorCount: 16,
              unpackedSurfaceExposedFiles: ["manifest.json", "bootstrap.js"],
            },
          },
          {
            id: "shielded-surface-scrub",
            recommendedAction: "promote-experimental-candidate",
            summary: "surface-scrub matrix",
            signals: {},
          },
          {
            id: "shielded-pref-bridge",
            recommendedAction: "promote-experimental-candidate",
            summary: "pref-bridge matrix",
            signals: {
              unpackedSurfaceAnchorCount: 28,
            },
          },
        ],
      },
      compareReports: [
        buildCompareReport({
          variant: "shielded-surface-scrub",
          summary: "surface-scrub keeps hardening-win and reaches manifest floor",
          unpackedAnchorDeltaCount: -14,
          unpackedMatchDeltaCount: -27,
          residualFloorReached: true,
          residualExposedFiles: ["manifest.json"],
          residualAnchorIds: ["addon-version-literal", "update-url-literal"],
          xpiBytes: -50970,
        }),
        buildCompareReport({
          variant: "shielded-pref-bridge",
          summary: "pref-bridge keeps hardening-win",
          unpackedAnchorDeltaCount: -2,
          unpackedMatchDeltaCount: -8,
          xpiBytes: 150813,
          prepareDurationMs: 5,
          decodeDurationMs: 1,
        }),
      ],
    });

    assert.equal(report.status, "passed");
    assert.equal(report.nextAction, "keep-surface-scrub-advisory");
    assert.equal(report.baseline?.sourceProxyReducedAnchorCount, 48);
    assert.equal(report.baseline?.unpackedSurfaceAnchorCount, 16);
    assert.equal(report.topCandidate?.id, "shielded-surface-scrub");
    assert.equal(report.topCandidate?.signals?.sourceProxyReducedAnchorCount, null);
    assert.equal(report.topCandidate?.signals?.residualFloorReached, true);
    assert.deepEqual(report.topCandidate?.signals?.residualExposedFiles, ["manifest.json"]);
    assert.ok(report.topCandidate?.signals?.residualAnchorIds?.includes("addon-version-literal"));
    assert.ok(report.topCandidate?.signals?.residualAnchorIds?.includes("update-url-literal"));
    assert.equal(report.reviewQueue[1]?.id, "shielded-pref-bridge");
  });

  it("should report missing when the top review candidate has no compare artifact", () => {
    const report = summarizePackageProtectionRetainedReview({
      guidedAttackPlanReport: {
        tasks: [
          {
            id: "shielded-surface-scrub-stable-review",
            kind: "review-experimental-hardening",
            candidateId: "shielded-surface-scrub",
            variant: "shielded-surface-scrub",
            channel: "stable",
            reviewRank: 1,
          },
        ],
      },
      matrixReport: {
        candidates: [
          {
            id: "shielded-surface-scrub",
            recommendedAction: "promote-experimental-candidate",
          },
        ],
      },
      compareReports: [],
    });

    assert.equal(report.status, "missing");
    assert.equal(report.nextAction, "refresh-review-artifacts");
  });

  it("should report failed when the top candidate regresses", () => {
    const report = summarizePackageProtectionRetainedReview({
      guidedAttackPlanReport: {
        tasks: [
          {
            id: "shielded-surface-scrub-stable-review",
            kind: "review-experimental-hardening",
            candidateId: "shielded-surface-scrub",
            variant: "shielded-surface-scrub",
            channel: "stable",
            reviewRank: 1,
          },
        ],
      },
      matrixReport: {
        candidates: [
          {
            id: "shielded-surface-scrub",
            recommendedAction: "stop-current-candidate",
          },
        ],
      },
      compareReports: [
        buildCompareReport({
          variant: "shielded-surface-scrub",
          status: "failed",
          decision: "regression",
          nextAction: "stop-current-candidate",
        }),
      ],
    });

    assert.equal(report.status, "failed");
    assert.equal(report.nextAction, "fix-experiment-regression");
  });

  it("should report attention when top candidate no longer closes as hardening-win", () => {
    const report = summarizePackageProtectionRetainedReview({
      guidedAttackPlanReport: {
        tasks: [
          {
            id: "shielded-surface-scrub-stable-review",
            kind: "review-experimental-hardening",
            candidateId: "shielded-surface-scrub",
            variant: "shielded-surface-scrub",
            channel: "stable",
            reviewRank: 1,
          },
        ],
      },
      matrixReport: {
        candidates: [
          {
            id: "shielded-surface-scrub",
            recommendedAction: "stop-current-candidate",
          },
        ],
      },
      compareReports: [
        buildCompareReport({
          variant: "shielded-surface-scrub",
          status: "attention",
          decision: "leaning-same",
          nextAction: "stop-current-candidate",
        }),
      ],
    });

    assert.equal(report.status, "attention");
    assert.equal(report.nextAction, "review-next-retained-candidate");
  });

  it("should report attention when top candidate still needs llm symmetry evidence", () => {
    const report = summarizePackageProtectionRetainedReview({
      guidedAttackPlanReport: {
        tasks: [
          {
            id: "shielded-surface-scrub-stable-review",
            kind: "review-experimental-hardening",
            candidateId: "shielded-surface-scrub",
            variant: "shielded-surface-scrub",
            channel: "stable",
            reviewRank: 1,
          },
        ],
      },
      matrixReport: {
        candidates: [
          {
            id: "shielded-surface-scrub",
            recommendedAction: "collect-llm-symmetry-evidence",
          },
        ],
      },
      compareReports: [
        buildCompareReport({
          variant: "shielded-surface-scrub",
          status: "passed",
          decision: "hardening-win",
        }),
      ],
    });

    assert.equal(report.status, "attention");
    assert.equal(report.nextAction, "collect-llm-symmetry-evidence");
    assert.ok(report.summary.includes("single-pass LLM"));
  });

  it("should persist retained review artifacts", async () => {
    const projectRootPath = fs.mkdtempSync(path.join(os.tmpdir(), "package-protection-retained-review-"));
    try {
      const report = summarizePackageProtectionRetainedReview({});
      const paths = await persistPackageProtectionRetainedReview(report, {
        projectRootPath,
      });
      assert.ok(fs.existsSync(paths.reportPath));
      assert.ok(fs.existsSync(paths.reportMDPath));
      const markdown = fs.readFileSync(paths.reportMDPath, "utf-8");
      assert.ok(markdown.includes("Package Protection Retained Review"));
    } finally {
      fs.rmSync(projectRootPath, { recursive: true, force: true });
    }
  });
});
