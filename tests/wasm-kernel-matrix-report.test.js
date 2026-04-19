import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  parseWasmKernelMatrixArgs,
  persistWasmKernelMatrixReport,
  runWasmKernelMatrixReport,
  summarizeWasmKernelMatrixReport,
} from "../scripts/wasm-kernel-matrix-report.mjs";

function writeJSON(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

function createFixtureProject() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wasm-kernel-matrix-"));

  writeJSON(path.join(projectRoot, "config", "optional-bundles.json"), {
    schemaVersion: 1,
    summary: "test",
    bundles: [
      {
        id: "wasm-kernel",
        enabled: false,
        lane: "js-core",
        implementationStatus: "planned",
        summary: "test",
        validation: {
          summary: "test",
          requiredFiles: [
            "addon-static/content/lib/w/probe.wasm",
            "addon-static/content/lib/w/wasm-probe-worker.js",
            "src/services/wasm-loader.js",
            "src/services/wasm-worker.js",
            "src/features/wasm-kernel-probe.js",
            "scripts/wasm-kernel-smoke.mjs",
            "scripts/wasm-kernel-performance-report.mjs",
            "scripts/wasm-kernel-disabled-contract-report.mjs",
            "scripts/wasm-kernel-matrix-report.mjs",
          ],
          requiredPackageScripts: [
            "wasm:kernel:smoke",
            "wasm:kernel:perf",
            "wasm:kernel:disabled-contract",
            "wasm:kernel:matrix",
          ],
        },
        docs: ["docs/OPTIONAL_BUNDLES.md"],
      },
    ],
  });
  writeJSON(path.join(projectRoot, "package.json"), {
    name: "fixture",
    private: true,
    scripts: {
      build: "node scripts/build.mjs",
      package: "node scripts/package.mjs",
      check: "npm test",
      "wasm:kernel:smoke": "node scripts/wasm-kernel-smoke.mjs",
      "wasm:kernel:perf": "node scripts/wasm-kernel-performance-report.mjs",
      "wasm:kernel:disabled-contract": "node scripts/wasm-kernel-disabled-contract-report.mjs",
      "wasm:kernel:matrix": "node scripts/wasm-kernel-matrix-report.mjs",
    },
  });

  [
    "addon-static/content/lib/w/probe.wasm",
    "addon-static/content/lib/w/wasm-probe-worker.js",
    "src/services/wasm-loader.js",
    "src/services/wasm-worker.js",
    "src/features/wasm-kernel-probe.js",
    "scripts/wasm-kernel-smoke.mjs",
    "scripts/wasm-kernel-performance-report.mjs",
    "scripts/wasm-kernel-disabled-contract-report.mjs",
    "scripts/wasm-kernel-matrix-report.mjs",
  ].forEach((relativePath) => {
    writeText(path.join(projectRoot, relativePath), "fixture\n");
  });

  writeJSON(path.join(projectRoot, "dist", "wasm-kernel-smoke.json"), {
    scenarioName: "wasm kernel probe diagnostics",
    repeats: 3,
    passedRunCount: 3,
    failedRunCount: 0,
    status: "passed",
    metrics: {
      mainThreadTotalDurationMsMedian: 1,
      workerTotalDurationMsMedian: 3,
      probeTotalDurationMsMedian: 4,
    },
    assets: {
      source: { combinedBytes: 8148 },
      build: { combinedBytes: 8148 },
    },
  });
  writeJSON(path.join(projectRoot, "dist", "wasm-kernel-performance.json"), {
    status: "passed",
    observedRunCount: 3,
    passedRunCount: 3,
    failedRunCount: 0,
    summary: "probe perf",
    artifactSource: "wasm-kernel-smoke",
    transports: {
      mainThread: { totalDurationMs: { median: 1 } },
      worker: { totalDurationMs: { median: 3 } },
    },
    overall: {
      probeTotalDurationMs: { median: 4 },
    },
    assets: {
      source: { combinedBytes: 8148 },
      build: { combinedBytes: 8148 },
    },
  });
  writeJSON(path.join(projectRoot, "dist", "wasm-kernel-disabled-contract.json"), {
    status: "passed",
    summary: "probe disabled ok",
    exportContract: {
      exportBundle: {
        id: "wasm-kernel",
        enabled: false,
        implementationStatus: "planned",
      },
    },
  });

  writeJSON(path.join(projectRoot, "dist", "wasm-kernel-digest-smoke.json"), {
    scenarioName: "wasm kernel digest diagnostics",
    repeats: 3,
    passedRunCount: 3,
    failedRunCount: 0,
    status: "passed",
    metrics: {
      mainThreadTotalDurationMsMedian: 1,
      workerTotalDurationMsMedian: 5,
      probeTotalDurationMsMedian: 7,
    },
    assets: {
      source: { combinedBytes: 8148 },
      build: { combinedBytes: 8148 },
    },
  });
  writeJSON(path.join(projectRoot, "dist", "wasm-kernel-digest-performance.json"), {
    status: "passed",
    observedRunCount: 3,
    passedRunCount: 3,
    failedRunCount: 0,
    summary: "digest perf",
    artifactSource: "wasm-kernel-smoke",
    transports: {
      mainThread: { totalDurationMs: { median: 1 } },
      worker: { totalDurationMs: { median: 5 } },
    },
    overall: {
      probeTotalDurationMs: { median: 7 },
    },
    assets: {
      source: { combinedBytes: 8148 },
      build: { combinedBytes: 8148 },
    },
  });
  writeJSON(path.join(projectRoot, "dist", "wasm-kernel-digest-disabled-contract.json"), {
    status: "passed",
    summary: "digest disabled ok",
    exportContract: {
      exportBundle: {
        id: "wasm-kernel",
        enabled: false,
        implementationStatus: "planned",
      },
    },
  });

  return projectRoot;
}

describe("Wasm Kernel Matrix Report", () => {
  it("should parse default and explicit args", () => {
    const defaults = parseWasmKernelMatrixArgs([]);
    assert.ok(defaults.projectRootPath.endsWith("AddonTemplate4Z"));

    const explicit = parseWasmKernelMatrixArgs(["--project-root", "/tmp/project"]);
    assert.equal(explicit.projectRootPath, "/tmp/project");
  });

  it("should summarize complete matrix evidence without promoting the bundle", () => {
    const report = summarizeWasmKernelMatrixReport({
      bundle: {
        id: "wasm-kernel",
        enabled: false,
        lane: "js-core",
        implementationStatus: "planned",
        validation: {
          requiredFiles: ["scripts/wasm-kernel-matrix-report.mjs"],
          requiredPackageScripts: ["wasm:kernel:matrix"],
        },
      },
      contractInspection: {
        ok: true,
        issues: [],
      },
      probeScenario: {
        key: "probe",
        label: "Wasm probe",
        status: "passed",
        evidence: {
          smokeStatus: "passed",
          performanceStatus: "passed",
          disabledContractStatus: "passed",
        },
        observedRunCount: 3,
        metrics: {
          sourceCombinedBytes: 8148,
        },
        disabledContract: {
          status: "passed",
        },
      },
      digestScenario: {
        key: "digest",
        label: "Wasm digest micro-kernel",
        status: "passed",
        evidence: {
          smokeStatus: "passed",
          performanceStatus: "passed",
          disabledContractStatus: "passed",
        },
        observedRunCount: 3,
        metrics: {
          sourceCombinedBytes: 8148,
        },
        disabledContract: {
          status: "passed",
        },
      },
    });

    assert.equal(report.status, "passed");
    assert.equal(report.nextAction, "keep-planned-default-disabled");
    assert.equal(report.promotionGate.status, "passed");
    assert.equal(report.promotionGate.gates.every((gate) => gate.ok), true);
  });

  it("should generate and persist a matrix report from fixture artifacts", async () => {
    const projectRoot = createFixtureProject();
    const { report, paths } = await runWasmKernelMatrixReport({ projectRootPath: projectRoot });

    assert.equal(report.status, "passed");
    assert.equal(report.nextAction, "keep-planned-default-disabled");
    assert.equal(report.scenarios.length, 2);
    assert.equal(report.scenarios[0].artifactPaths.smokeReportPath.endsWith("wasm-kernel-smoke.json"), true);
    assert.equal(report.scenarios[1].artifactPaths.smokeReportPath.endsWith("wasm-kernel-digest-smoke.json"), true);

    assert.equal(fs.existsSync(paths.reportPath), true);
    assert.equal(fs.existsSync(paths.reportMDPath), true);

    const persisted = JSON.parse(fs.readFileSync(paths.reportPath, "utf-8"));
    assert.equal(persisted.promotionGate.decision, "keep-planned-default-disabled");
    assert.equal(persisted.scenarios[1].metrics.workerMedianMs, 5);
  });

  it("should persist a provided matrix report to the standard dist paths", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wasm-kernel-matrix-persist-"));
    const report = {
      generatedAt: "2026-04-19T00:00:00.000Z",
      advisory: true,
      bundleId: "wasm-kernel",
      status: "passed",
      statusLabel: "通过",
      nextAction: "keep-planned-default-disabled",
      summary: "fixture",
      registry: {
        bundle: {
          id: "wasm-kernel",
          enabled: false,
          lane: "js-core",
          implementationStatus: "planned",
        },
        contractOK: true,
        issueCount: 0,
        issues: [],
      },
      sources: {
        probePresent: true,
        digestPresent: true,
      },
      scenarios: [],
      promotionGate: {
        status: "passed",
        statusLabel: "通过",
        decision: "keep-planned-default-disabled",
        summary: "fixture",
        gates: [],
      },
    };

    const paths = await persistWasmKernelMatrixReport(report, { projectRootPath: projectRoot });
    assert.equal(paths.reportPath, path.join(projectRoot, "dist", "wasm-kernel-matrix.json"));
    assert.equal(paths.reportMDPath, path.join(projectRoot, "dist", "wasm-kernel-matrix.md"));
    assert.equal(fs.existsSync(paths.reportPath), true);
    assert.equal(fs.existsSync(paths.reportMDPath), true);
  });
});
