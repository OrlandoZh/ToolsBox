import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  parsePackageProtectionStrategyArgs,
  persistPackageProtectionStrategy,
  renderPackageProtectionStrategyMarkdown,
  summarizePackageProtectionStrategy,
} from "../scripts/package-protection-strategy-report.mjs";

describe("Package Protection Strategy Report", () => {
  it("should parse default strategy args", () => {
    const options = parsePackageProtectionStrategyArgs([]);
    assert.ok(options.projectRootPath.endsWith("AddonTemplate4Z"));
    assert.ok(options.matrixPath.endsWith(path.join("dist", "package-protection-matrix.json")));
    assert.ok(options.retainedReviewPath.endsWith(path.join("dist", "package-protection-retained-review.json")));
    assert.ok(options.wasmAdmissionPath.endsWith(path.join("dist", "package-protection-wasm-admission.json")));
    assert.ok(options.registryPath.endsWith(path.join("config", "package-protection-candidates.json")));
  });

  it("should keep shielded as current primary and surface-scrub as retained top", () => {
    const report = summarizePackageProtectionStrategy({
      matrixReport: {
        status: "passed",
        nextAction: "keep-current-shielded",
        summary: "matrix ok",
      },
      retainedReviewReport: {
        status: "passed",
        nextAction: "keep-surface-scrub-advisory",
        summary: "surface-scrub retained",
        topCandidate: {
          id: "shielded-surface-scrub",
        },
      },
      wasmAdmissionReport: {
        status: "ready-for-candidate",
        nextAction: "open-wasm-candidate-wave",
        summary: "wasm digest ready",
        wasmLane: {
          route5Candidate: {
            id: "shielded-surface-scrub-wasm-digest",
          },
        },
      },
      registry: {
        candidates: [
          {
            id: "encrypted",
            class: "current",
            status: "current-baseline",
            summary: "baseline",
          },
          {
            id: "shielded",
            class: "current",
            status: "current-primary",
            summary: "primary",
          },
          {
            id: "shielded-surface-scrub",
            class: "experiment",
            status: "retained-top-candidate",
            summary: "retained top",
          },
          {
            id: "shielded-surface-scrub-wasm-digest",
            class: "experiment",
            status: "retained-experiment-candidate",
            summary: "bounded wasm",
          },
        ],
      },
    });

    assert.equal(report.status, "passed");
    assert.equal(report.nextAction, "keep-surface-scrub-advisory");
    assert.equal(report.lanes.primary.id, "shielded");
    assert.equal(report.lanes.retainedTop.id, "shielded-surface-scrub");
    assert.equal(report.lanes.wasmRoute.id, "shielded-surface-scrub-wasm-digest");
    assert.equal(report.lanes.wasmRoute.readyForCandidate, true);
    assert.ok(report.summary.includes("shielded"));
    assert.ok(report.summary.includes("surface-scrub"));
  });

  it("should raise attention when matrix or retained top is not ready", () => {
    const report = summarizePackageProtectionStrategy({
      matrixReport: {
        status: "attention",
        nextAction: "keep-current-shielded",
        summary: "matrix stale",
      },
      retainedReviewReport: {
        status: "passed",
        nextAction: "keep-pref-bridge-advisory",
        summary: "pref bridge retained",
        topCandidate: {
          id: "shielded-pref-bridge",
        },
      },
      wasmAdmissionReport: null,
      registry: {
        candidates: [
          {
            id: "shielded",
            class: "current",
            status: "current-primary",
            summary: "primary",
          },
        ],
      },
    });

    assert.equal(report.status, "attention");
    assert.equal(report.nextAction, "keep-current-shielded");
    assert.equal(report.lanes.retainedTop.id, "shielded-pref-bridge");
  });

  it("should persist strategy artifacts", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "package-protection-strategy-"));
    try {
      const report = summarizePackageProtectionStrategy({
        matrixReport: { status: "passed" },
        retainedReviewReport: {
          topCandidate: {
            id: "shielded-surface-scrub",
          },
        },
        wasmAdmissionReport: {
          status: "ready-for-candidate",
          wasmLane: {
            route5Candidate: {
              id: "shielded-surface-scrub-wasm-digest",
            },
          },
        },
        registry: {
          candidates: [
            { id: "encrypted", status: "current-baseline" },
            { id: "shielded", status: "current-primary" },
            { id: "shielded-surface-scrub", status: "retained-top-candidate" },
            { id: "shielded-surface-scrub-wasm-digest", status: "retained-experiment-candidate" },
          ],
        },
      });

      const paths = await persistPackageProtectionStrategy(report, {
        projectRootPath: projectRoot,
      });
      const storedReport = JSON.parse(fs.readFileSync(paths.reportPath, "utf-8"));
      const markdown = fs.readFileSync(paths.reportMDPath, "utf-8");

      assert.equal(storedReport.lanes.primary.id, "shielded");
      assert.ok(markdown.includes("# Package Protection Strategy"));
      assert.ok(markdown.includes("shielded-surface-scrub"));
      assert.equal(renderPackageProtectionStrategyMarkdown(report).includes("package:shielded:surface-scrub"), true);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
