import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  DEFAULT_WASM_KERNEL_DIGEST_SCENARIO_NAME,
  DEFAULT_WASM_KERNEL_UNLOCK_SCENARIO_NAME,
  DEFAULT_WASM_KERNEL_SCENARIO_NAME,
  parseWasmKernelPerformanceArgs,
  persistWasmKernelPerformanceReport,
  summarizeWasmKernelPerformanceReport,
} from "../scripts/wasm-kernel-performance-report.mjs";
import {
  WASM_KERNEL_PROBE_PATH,
  WASM_KERNEL_PROBE_WORKER_PATH,
} from "../src/utils/optional-bundle-paths.js";

const WASM_PROBE_JAR_URL = `jar:file:///tmp/cleanroom.xpi!/${WASM_KERNEL_PROBE_PATH}`;
const WASM_PROBE_CHROME_URL = `chrome://cleanroomtemplate/${WASM_KERNEL_PROBE_PATH}`;
const WASM_PROBE_WORKER_URL = `chrome://cleanroomtemplate/${WASM_KERNEL_PROBE_WORKER_PATH}`;

function buildE2EReport() {
  return {
    generatedAt: "2026-04-18T12:00:00.000Z",
    zoteroVersion: "9.0",
    cycles: [
      {
        index: 1,
        zoteroVersion: "9.0",
        bootMode: "restart",
        scenarios: {
          results: [
            {
              name: DEFAULT_WASM_KERNEL_SCENARIO_NAME,
              status: "passed",
              durationMs: 18,
              details: {
                rootURI: "jar:file:///tmp/cleanroom.xpi!/",
                wasmRelativePath: WASM_KERNEL_PROBE_PATH,
                workerRelativePath: WASM_KERNEL_PROBE_WORKER_PATH,
                mainThread: {
                  ok: true,
                  url: WASM_PROBE_JAR_URL,
                  bytesLength: 41,
                  cacheHit: false,
                  timing: {
                    initDurationMs: 3,
                    invokeDurationMs: 1,
                    totalDurationMs: 4,
                  },
                },
                worker: {
                  ok: true,
                  workerURL: WASM_PROBE_WORKER_URL,
                  wasmURL: WASM_PROBE_CHROME_URL,
                  bytesLength: 41,
                  timing: {
                    initDurationMs: 6,
                    invokeDurationMs: 1,
                    totalDurationMs: 7,
                  },
                },
                consistentAcrossTransports: true,
                readiness: {
                  ok: true,
                },
                timingSummary: {
                  initDurationMs: 9,
                  invokeDurationMs: 2,
                  totalInitDurationMs: 9,
                  totalInvokeDurationMs: 2,
                  totalDurationMs: 11,
                  measuredTransportDurationMs: 11,
                  transportCount: 2,
                  slowestTransport: "worker",
                },
              },
            },
          ],
        },
      },
      {
        index: 2,
        zoteroVersion: "9.0",
        bootMode: "hot",
        scenarios: {
          results: [
            {
              name: DEFAULT_WASM_KERNEL_SCENARIO_NAME,
              status: "passed",
              durationMs: 20,
              details: {
                rootURI: "jar:file:///tmp/cleanroom.xpi!/",
                wasmRelativePath: WASM_KERNEL_PROBE_PATH,
                workerRelativePath: WASM_KERNEL_PROBE_WORKER_PATH,
                mainThread: {
                  ok: true,
                  url: WASM_PROBE_JAR_URL,
                  bytesLength: 41,
                  cacheHit: false,
                  timing: {
                    initDurationMs: 5,
                    invokeDurationMs: 1,
                    totalDurationMs: 6,
                  },
                },
                worker: {
                  ok: true,
                  workerURL: WASM_PROBE_WORKER_URL,
                  wasmURL: WASM_PROBE_CHROME_URL,
                  bytesLength: 41,
                  timing: {
                    initDurationMs: 8,
                    invokeDurationMs: 2,
                    totalDurationMs: 10,
                  },
                },
                consistentAcrossTransports: true,
                readiness: {
                  ok: true,
                },
                timingSummary: {
                  initDurationMs: 13,
                  invokeDurationMs: 3,
                  totalInitDurationMs: 13,
                  totalInvokeDurationMs: 3,
                  totalDurationMs: 16,
                  measuredTransportDurationMs: 16,
                  transportCount: 2,
                  slowestTransport: "worker",
                },
              },
            },
          ],
        },
      },
    ],
  };
}

function buildAssetInventory() {
  return {
    addonRef: "cleanroomtemplate",
    source: {
      wasm: {
        path: "/tmp/source/probe.wasm",
        present: true,
        sizeBytes: 41,
      },
      worker: {
        path: "/tmp/source/wasm-probe-worker.js",
        present: true,
        sizeBytes: 321,
      },
      combinedBytes: 362,
    },
    build: {
      wasm: {
        path: "/tmp/build/probe.wasm",
        present: true,
        sizeBytes: 41,
      },
      worker: {
        path: "/tmp/build/wasm-probe-worker.js",
        present: true,
        sizeBytes: 321,
      },
      combinedBytes: 362,
    },
    deltas: {
      wasmBytes: 0,
      workerBytes: 0,
      combinedBytes: 0,
    },
  };
}

function buildScenarioLastRunReport() {
  return {
    generatedAt: "2026-04-18T12:05:00.000Z",
    selectedScenarios: [
      {
        name: DEFAULT_WASM_KERNEL_SCENARIO_NAME,
        sourceFile: "zotero-scenarios/wasm-kernel-probe.scenario.js",
      },
    ],
    results: [
      {
        name: DEFAULT_WASM_KERNEL_SCENARIO_NAME,
        status: "passed",
        durationMs: 12,
        details: {
          rootURI: "jar:file:///tmp/cleanroom.xpi!/",
          wasmRelativePath: WASM_KERNEL_PROBE_PATH,
          workerRelativePath: WASM_KERNEL_PROBE_WORKER_PATH,
          mainThread: {
            ok: true,
            url: WASM_PROBE_JAR_URL,
            bytesLength: 41,
            cacheHit: false,
            timing: {
              initDurationMs: 4,
              invokeDurationMs: 1,
              totalDurationMs: 5,
            },
          },
          worker: {
            ok: true,
            workerURL: WASM_PROBE_WORKER_URL,
            wasmURL: WASM_PROBE_CHROME_URL,
            bytesLength: 41,
            timing: {
              initDurationMs: 7,
              invokeDurationMs: 1,
              totalDurationMs: 8,
            },
          },
          consistentAcrossTransports: true,
          readiness: {
            ok: true,
          },
          timingSummary: {
            initDurationMs: 11,
            invokeDurationMs: 2,
            totalInitDurationMs: 11,
            totalInvokeDurationMs: 2,
            totalDurationMs: 13,
            measuredTransportDurationMs: 13,
            transportCount: 2,
            slowestTransport: "worker",
          },
        },
      },
    ],
  };
}

function buildSmokeReport() {
  return {
    scenarioName: DEFAULT_WASM_KERNEL_SCENARIO_NAME,
    repeats: 3,
    zoteroVersion: "9.0",
    runs: [
      {
        runIndex: 1,
        scenarioName: DEFAULT_WASM_KERNEL_SCENARIO_NAME,
        status: "passed",
        durationMs: 6,
        details: {
          rootURI: "jar:file:///tmp/cleanroom.xpi!/",
          wasmRelativePath: WASM_KERNEL_PROBE_PATH,
          workerRelativePath: WASM_KERNEL_PROBE_WORKER_PATH,
          mainThread: {
            ok: true,
            url: WASM_PROBE_JAR_URL,
            bytesLength: 41,
            cacheHit: false,
            timing: {
              initDurationMs: 1,
              invokeDurationMs: 0,
              totalDurationMs: 1,
            },
          },
          worker: {
            ok: true,
            workerURL: WASM_PROBE_WORKER_URL,
            wasmURL: WASM_PROBE_CHROME_URL,
            bytesLength: 41,
            timing: {
              initDurationMs: 3,
              invokeDurationMs: 0,
              totalDurationMs: 3,
            },
          },
          consistentAcrossTransports: true,
          readiness: {
            ok: true,
          },
          timingSummary: {
            totalDurationMs: 4,
            totalInitDurationMs: 4,
            totalInvokeDurationMs: 0,
            measuredTransportDurationMs: 4,
            slowestTransport: "worker",
          },
        },
      },
      {
        runIndex: 2,
        scenarioName: DEFAULT_WASM_KERNEL_SCENARIO_NAME,
        status: "passed",
        durationMs: 5,
        details: {
          rootURI: "jar:file:///tmp/cleanroom.xpi!/",
          wasmRelativePath: WASM_KERNEL_PROBE_PATH,
          workerRelativePath: WASM_KERNEL_PROBE_WORKER_PATH,
          mainThread: {
            ok: true,
            url: WASM_PROBE_JAR_URL,
            bytesLength: 41,
            cacheHit: false,
            timing: {
              initDurationMs: 1,
              invokeDurationMs: 0,
              totalDurationMs: 1,
            },
          },
          worker: {
            ok: true,
            workerURL: WASM_PROBE_WORKER_URL,
            wasmURL: WASM_PROBE_CHROME_URL,
            bytesLength: 41,
            timing: {
              initDurationMs: 2,
              invokeDurationMs: 0,
              totalDurationMs: 2,
            },
          },
          consistentAcrossTransports: true,
          readiness: {
            ok: true,
          },
          timingSummary: {
            totalDurationMs: 3,
            totalInitDurationMs: 3,
            totalInvokeDurationMs: 0,
            measuredTransportDurationMs: 3,
            slowestTransport: "worker",
          },
        },
      },
      {
        runIndex: 3,
        scenarioName: DEFAULT_WASM_KERNEL_SCENARIO_NAME,
        status: "passed",
        durationMs: 8,
        details: {
          rootURI: "jar:file:///tmp/cleanroom.xpi!/",
          wasmRelativePath: WASM_KERNEL_PROBE_PATH,
          workerRelativePath: WASM_KERNEL_PROBE_WORKER_PATH,
          mainThread: {
            ok: true,
            url: WASM_PROBE_JAR_URL,
            bytesLength: 41,
            cacheHit: false,
            timing: {
              initDurationMs: 2,
              invokeDurationMs: 0,
              totalDurationMs: 2,
            },
          },
          worker: {
            ok: true,
            workerURL: WASM_PROBE_WORKER_URL,
            wasmURL: WASM_PROBE_CHROME_URL,
            bytesLength: 41,
            timing: {
              initDurationMs: 4,
              invokeDurationMs: 0,
              totalDurationMs: 4,
            },
          },
          consistentAcrossTransports: true,
          readiness: {
            ok: true,
          },
          timingSummary: {
            totalDurationMs: 6,
            totalInitDurationMs: 6,
            totalInvokeDurationMs: 0,
            measuredTransportDurationMs: 6,
            slowestTransport: "worker",
          },
        },
      },
    ],
  };
}

describe("Wasm Kernel Performance Report", () => {
  it("should parse default and explicit args", () => {
    const defaults = parseWasmKernelPerformanceArgs([]);
    assert.ok(defaults.inputPath.endsWith(path.join("dist", "agent-zotero-e2e.json")));
    assert.ok(defaults.scenarioReportPath.endsWith(path.join("dist", "zotero-scenario-last-run.json")));
    assert.ok(defaults.smokeReportPath.endsWith(path.join("dist", "wasm-kernel-smoke.json")));
    assert.equal(defaults.scenarioName, DEFAULT_WASM_KERNEL_SCENARIO_NAME);

    const explicit = parseWasmKernelPerformanceArgs([
      "--input",
      "./tmp/agent-zotero-e2e.json",
      "--scenario-report",
      "./tmp/zotero-scenario-last-run.json",
      "--scenario",
      "custom scenario",
    ]);
    assert.ok(explicit.inputPath.endsWith(path.join("tmp", "agent-zotero-e2e.json")));
    assert.ok(explicit.scenarioReportPath.endsWith(path.join("tmp", "zotero-scenario-last-run.json")));
    assert.ok(explicit.smokeReportPath.endsWith(path.join("dist", "wasm-kernel-custom-scenario-smoke.json")));
    assert.equal(explicit.scenarioName, "custom scenario");
  });

  it("should default digest performance reports to the digest smoke artifact", () => {
    const digestArgs = parseWasmKernelPerformanceArgs([
      "--scenario",
      DEFAULT_WASM_KERNEL_DIGEST_SCENARIO_NAME,
    ]);

    assert.ok(digestArgs.smokeReportPath.endsWith(path.join("dist", "wasm-kernel-digest-smoke.json")));
  });

  it("should summarize probe timings and asset sizes", () => {
    const report = summarizeWasmKernelPerformanceReport({
      e2eReport: buildE2EReport(),
      e2eReportPath: "/tmp/agent-zotero-e2e.json",
      scenarioName: DEFAULT_WASM_KERNEL_SCENARIO_NAME,
      assetInventory: buildAssetInventory(),
    });

    assert.equal(report.status, "passed");
    assert.equal(report.observedRunCount, 2);
    assert.equal(report.passedRunCount, 2);
    assert.equal(report.transports.mainThread.totalDurationMs.median, 5);
    assert.equal(report.transports.worker.totalDurationMs.median, 8.5);
    assert.equal(report.overall.probeTotalDurationMs.median, 13.5);
    assert.equal(report.overall.scenarioDurationMs.max, 20);
    assert.equal(report.comparisons.workerVsMainThread.totalDurationMsDelta, 3.5);
    assert.equal(report.consistency.allCrossTransportConsistent, true);
    assert.equal(report.assets.source.combinedBytes, 362);
    assert.ok(report.recommendations.includes("worker-transport-heavier-than-main-thread"));
    assert.ok(report.recommendations.includes("build-assets-match-source"));
    assert.ok(report.summary.includes("planned + default-disabled"));
  });

  it("should label custom unlock reports as unlock derivation", () => {
    const report = summarizeWasmKernelPerformanceReport({
      e2eReport: buildE2EReport(),
      e2eReportPath: "/tmp/agent-zotero-e2e.json",
      scenarioName: DEFAULT_WASM_KERNEL_UNLOCK_SCENARIO_NAME,
      assetInventory: buildAssetInventory(),
    });

    assert.equal(report.status, "missing");
    assert.ok(report.summary.includes("Wasm unlock derivation"));
  });

  it("should mark probe performance as digest-ready when repeated digest smoke evidence exists", () => {
    const digestSmokeReport = {
      ...buildSmokeReport(),
      scenarioName: DEFAULT_WASM_KERNEL_DIGEST_SCENARIO_NAME,
      status: "passed",
      passedRunCount: 3,
      failedRunCount: 0,
      runs: buildSmokeReport().runs.map((run) => ({
        ...run,
        scenarioName: DEFAULT_WASM_KERNEL_DIGEST_SCENARIO_NAME,
      })),
    };
    const report = summarizeWasmKernelPerformanceReport({
      smokeReport: buildSmokeReport(),
      digestSmokeReport,
      smokeReportPath: "/tmp/wasm-kernel-probe-smoke.json",
      scenarioName: DEFAULT_WASM_KERNEL_SCENARIO_NAME,
      assetInventory: buildAssetInventory(),
    });

    assert.ok(report.recommendations.includes("digest-smoke-observed"));
    assert.ok(!report.recommendations.includes("keep-wasm-kernel-planned-until-digest-smoke-exists"));
  });

  it("should fall back to zotero-scenario-last-run when e2e data is unavailable", () => {
    const report = summarizeWasmKernelPerformanceReport({
      e2eReport: {
        cycles: [],
      },
      scenarioLastRunReport: buildScenarioLastRunReport(),
      e2eReportPath: "/tmp/agent-zotero-e2e.json",
      scenarioLastRunPath: "/tmp/zotero-scenario-last-run.json",
      scenarioName: DEFAULT_WASM_KERNEL_SCENARIO_NAME,
      assetInventory: buildAssetInventory(),
    });

    assert.equal(report.status, "passed");
    assert.equal(report.artifactSource, "zotero-scenario-last-run");
    assert.equal(report.observedRunCount, 1);
    assert.equal(report.transports.mainThread.totalDurationMs.median, 5);
    assert.equal(report.transports.worker.totalDurationMs.median, 8);
  });

  it("should prefer aggregated smoke runs over single-run artifacts", () => {
    const report = summarizeWasmKernelPerformanceReport({
      e2eReport: buildE2EReport(),
      scenarioLastRunReport: buildScenarioLastRunReport(),
      smokeReport: buildSmokeReport(),
      e2eReportPath: "/tmp/agent-zotero-e2e.json",
      scenarioLastRunPath: "/tmp/zotero-scenario-last-run.json",
      smokeReportPath: "/tmp/wasm-kernel-smoke.json",
      scenarioName: DEFAULT_WASM_KERNEL_SCENARIO_NAME,
      assetInventory: buildAssetInventory(),
    });

    assert.equal(report.artifactSource, "wasm-kernel-smoke");
    assert.equal(report.observedRunCount, 3);
    assert.equal(report.overall.probeTotalDurationMs.median, 4);
    assert.equal(report.transports.mainThread.totalDurationMs.median, 1);
    assert.equal(report.transports.worker.totalDurationMs.median, 3);
    assert.equal(report.comparisons.workerVsMainThread.totalDurationMsDelta, 2);
  });

  it("should persist latest performance artifacts", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wasm-kernel-performance-"));
    try {
      const report = summarizeWasmKernelPerformanceReport({
        e2eReport: buildE2EReport(),
        e2eReportPath: "/tmp/agent-zotero-e2e.json",
        scenarioName: DEFAULT_WASM_KERNEL_SCENARIO_NAME,
        assetInventory: buildAssetInventory(),
      });

      const paths = await persistWasmKernelPerformanceReport(report, {
        projectRootPath: projectRoot,
      });

      assert.ok(fs.existsSync(paths.reportPath));
      assert.ok(fs.existsSync(paths.reportMDPath));
      assert.ok(fs.existsSync(paths.latestJSONPath));
      assert.ok(fs.existsSync(paths.latestMDPath));
      const markdown = fs.readFileSync(paths.reportMDPath, "utf-8");
      assert.ok(markdown.includes("Wasm Kernel Performance"));
      assert.ok(markdown.includes("Asset Footprint"));
      assert.ok(markdown.includes("Overall Timing"));
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("should keep default probe performance aliases while persisting digest reports separately", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wasm-kernel-performance-split-"));
    try {
      const probeReport = summarizeWasmKernelPerformanceReport({
        e2eReport: buildE2EReport(),
        e2eReportPath: "/tmp/agent-zotero-e2e.json",
        scenarioName: DEFAULT_WASM_KERNEL_SCENARIO_NAME,
        assetInventory: buildAssetInventory(),
      });
      await persistWasmKernelPerformanceReport(probeReport, {
        projectRootPath: projectRoot,
      });

      const digestReport = summarizeWasmKernelPerformanceReport({
        smokeReport: {
          ...buildSmokeReport(),
          scenarioName: DEFAULT_WASM_KERNEL_DIGEST_SCENARIO_NAME,
          runs: buildSmokeReport().runs.map((run) => ({
            ...run,
            scenarioName: DEFAULT_WASM_KERNEL_DIGEST_SCENARIO_NAME,
          })),
        },
        smokeReportPath: "/tmp/wasm-kernel-digest-smoke.json",
        scenarioName: DEFAULT_WASM_KERNEL_DIGEST_SCENARIO_NAME,
        assetInventory: buildAssetInventory(),
      });
      const digestPaths = await persistWasmKernelPerformanceReport(digestReport, {
        projectRootPath: projectRoot,
      });

      const defaultProbeReport = JSON.parse(fs.readFileSync(path.join(projectRoot, "dist", "wasm-kernel-performance.json"), "utf-8"));
      const digestScenarioReport = JSON.parse(fs.readFileSync(digestPaths.reportPath, "utf-8"));
      assert.equal(defaultProbeReport.scenarioName, DEFAULT_WASM_KERNEL_SCENARIO_NAME);
      assert.equal(digestScenarioReport.scenarioName, DEFAULT_WASM_KERNEL_DIGEST_SCENARIO_NAME);
      assert.ok(fs.existsSync(path.join(projectRoot, "dist", "wasm-kernel-probe-performance.json")));
      assert.ok(fs.existsSync(path.join(projectRoot, "dist", "wasm-kernel-digest-performance.json")));
      assert.equal(digestPaths.defaultReportPath, null);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
