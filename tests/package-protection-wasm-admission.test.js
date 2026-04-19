import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  parsePackageProtectionWasmAdmissionArgs,
  persistPackageProtectionWasmAdmission,
  renderPackageProtectionWasmAdmissionMarkdown,
  summarizePackageProtectionWasmAdmission,
} from "../scripts/package-protection-wasm-admission.mjs";

describe("Package Protection Wasm Admission", () => {
  it("should parse default wasm admission args", () => {
    const options = parsePackageProtectionWasmAdmissionArgs([]);
    assert.ok(options.projectRootPath.endsWith("AddonTemplate4Z"));
    assert.ok(options.matrixPath.endsWith(path.join("dist", "package-protection-matrix.json")));
    assert.ok(options.retainedReviewPath.endsWith(path.join("dist", "package-protection-retained-review.json")));
    assert.ok(options.wasmMatrixPath.endsWith(path.join("dist", "wasm-kernel-matrix.json")));
    assert.ok(options.registryPath.endsWith(path.join("config", "package-protection-candidates.json")));
  });

  it("should stay not-ready when protection matrix has not passed", () => {
    const report = summarizePackageProtectionWasmAdmission({
      matrixReport: {
        status: "attention",
        nextAction: "keep-current-shielded",
        summary: "matrix pending",
      },
      retainedReviewReport: null,
      wasmMatrixReport: null,
      registry: null,
    });

    assert.equal(report.status, "not-ready");
    assert.equal(report.nextAction, "keep-current-shielded");
    assert.equal(report.verdict.protectionFreshUsable, false);
  });

  it("should raise attention when retained top candidate is not shielded-surface-scrub", () => {
    const report = summarizePackageProtectionWasmAdmission({
      matrixReport: {
        status: "passed",
        nextAction: "keep-current-shielded",
        summary: "matrix ok",
      },
      retainedReviewReport: {
        status: "passed",
        nextAction: "keep-top-candidate",
        topCandidate: {
          id: "shielded-pref-bridge",
          variant: "shielded-pref-bridge",
          channel: "stable",
          signals: {
            residualFloorReached: true,
            residualExposedFiles: ["manifest.json"],
            residualAnchorIds: ["addon-version-literal", "update-url-literal"],
          },
        },
      },
      wasmMatrixReport: null,
      registry: null,
    });

    assert.equal(report.status, "attention");
    assert.equal(report.nextAction, "freeze-surface-scrub-retained");
    assert.equal(report.retained.topCandidateRetained, false);
  });

  it("should raise attention when wasm matrix is missing or not passed", () => {
    const report = summarizePackageProtectionWasmAdmission({
      matrixReport: {
        status: "passed",
        nextAction: "keep-current-shielded",
        summary: "matrix ok",
      },
      retainedReviewReport: {
        status: "passed",
        nextAction: "keep-top-candidate",
        topCandidate: {
          id: "shielded-surface-scrub",
          variant: "shielded-surface-scrub",
          channel: "stable",
          compareStatus: "passed",
          compareDecision: "hardening-win",
          signals: {
            residualFloorReached: true,
            residualExposedFiles: ["manifest.json"],
            residualAnchorIds: ["addon-version-literal", "update-url-literal"],
          },
        },
      },
      wasmMatrixReport: {
        status: "attention",
        nextAction: "keep-planned-default-disabled",
        summary: "digest lane stale",
        registry: {
          bundle: {
            id: "wasm-kernel",
            implementationStatus: "planned",
            enabled: false,
          },
        },
        scenarios: [],
      },
      registry: {
        schemaVersion: 1,
        candidates: [
          {
            id: "shielded-surface-scrub-wasm-digest",
            class: "experiment",
            stage: "route5-wasm",
            baseVariant: "shielded-surface-scrub",
            compareVariant: "shielded-surface-scrub-wasm-digest",
            status: "retained-experiment-candidate",
            summary: "digest candidate",
          },
        ],
      },
    });

    assert.equal(report.status, "attention");
    assert.equal(report.nextAction, "refresh-wasm-matrix");
    assert.equal(report.verdict.wasmLaneReady, false);
  });

  it("should become ready-for-candidate when all admission conditions are satisfied", () => {
    const report = summarizePackageProtectionWasmAdmission({
      matrixReport: {
        status: "passed",
        nextAction: "keep-current-shielded",
        summary: "matrix ok",
      },
      retainedReviewReport: {
        status: "passed",
        nextAction: "keep-top-candidate",
        topCandidate: {
          id: "shielded-surface-scrub",
          variant: "shielded-surface-scrub",
          channel: "stable",
          compareStatus: "passed",
          compareDecision: "hardening-win",
          signals: {
            residualFloorReached: true,
            residualExposedFiles: ["manifest.json"],
            residualAnchorIds: ["addon-version-literal", "update-url-literal"],
          },
        },
      },
      wasmMatrixReport: {
        status: "passed",
        nextAction: "keep-planned-default-disabled",
        summary: "wasm matrix ok",
        registry: {
          bundle: {
            id: "wasm-kernel",
            implementationStatus: "planned",
            enabled: false,
          },
        },
        scenarios: [
          {
            key: "digest",
            status: "passed",
          },
        ],
      },
      registry: {
        schemaVersion: 1,
        updatedAt: "2026-04-19",
        candidates: [
          {
            id: "shielded-surface-scrub-wasm-digest",
            class: "experiment",
            stage: "route5-wasm",
            baseVariant: "shielded-surface-scrub",
            compareVariant: "shielded-surface-scrub-wasm-digest",
            status: "retained-experiment-candidate",
            summary: "digest candidate",
          },
        ],
      },
    });

    assert.equal(report.status, "ready-for-candidate");
    assert.equal(report.nextAction, "open-wasm-candidate-wave");
    assert.equal(report.verdict.protectionFreshUsable, true);
    assert.equal(report.verdict.retainedTopSurfaceScrub, true);
    assert.equal(report.verdict.retainedResidualFloorReached, true);
    assert.equal(report.verdict.wasmLaneReady, true);
    assert.equal(report.wasmLane.route5Candidate?.id, "shielded-surface-scrub-wasm-digest");
  });

  it("should persist wasm admission artifacts", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "package-protection-wasm-admission-"));
    try {
      const report = summarizePackageProtectionWasmAdmission({
        matrixReport: {
          status: "passed",
        },
        retainedReviewReport: {
          status: "passed",
          topCandidate: {
            id: "shielded-surface-scrub",
            signals: {
              residualFloorReached: true,
              residualExposedFiles: ["manifest.json"],
              residualAnchorIds: ["addon-version-literal", "update-url-literal"],
            },
          },
        },
        wasmMatrixReport: {
          status: "passed",
          registry: {
            bundle: {
              id: "wasm-kernel",
              implementationStatus: "planned",
              enabled: false,
            },
          },
          scenarios: [{ key: "digest", status: "passed" }],
        },
        registry: {
          schemaVersion: 1,
          candidates: [
            {
              id: "shielded-surface-scrub-wasm-digest",
              class: "experiment",
              stage: "route5-wasm",
              baseVariant: "shielded-surface-scrub",
              compareVariant: "shielded-surface-scrub-wasm-digest",
              status: "retained-experiment-candidate",
              summary: "digest candidate",
            },
          ],
        },
      });

      const paths = await persistPackageProtectionWasmAdmission(report, {
        projectRootPath: projectRoot,
      });
      const markdown = renderPackageProtectionWasmAdmissionMarkdown(report);

      assert.ok(fs.existsSync(paths.reportPath));
      assert.ok(fs.existsSync(paths.reportMDPath));
      assert.ok(markdown.includes("Package Protection Wasm Admission"));
      assert.ok(markdown.includes("route5Candidate"));
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
