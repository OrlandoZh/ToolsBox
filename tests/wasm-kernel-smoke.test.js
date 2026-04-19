import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  buildWasmKernelSmokeCommand,
  inspectWasmKernelScenarioArtifact,
  parseWasmKernelSmokeArgs,
  persistWasmKernelSmokeReport,
  renderWasmKernelSmokeMarkdown,
  runSingleWasmKernelSmokeIteration,
  summarizeWasmKernelSmokeReport,
} from "../scripts/wasm-kernel-smoke.mjs";
import {
  DEFAULT_WASM_KERNEL_DIGEST_SCENARIO_NAME,
  DEFAULT_WASM_KERNEL_SCENARIO_NAME,
} from "../scripts/wasm-kernel-performance-report.mjs";

function buildAssetInventory() {
  return {
    source: {
      combinedBytes: 4979,
    },
    build: {
      combinedBytes: 4979,
    },
  };
}

function buildRuns() {
  return [
    {
      runIndex: 1,
      scenarioName: DEFAULT_WASM_KERNEL_SCENARIO_NAME,
      passed: true,
      status: "passed",
      statusLabel: "通过",
      durationMs: 5,
      metrics: {
        probeTotalDurationMs: 4,
        mainThreadInitDurationMs: 1,
        mainThreadTotalDurationMs: 1,
        workerInitDurationMs: 3,
        workerTotalDurationMs: 3,
        consistentAcrossTransports: true,
        readinessOK: true,
      },
      stdoutTail: ["PASS"],
      stderrTail: [],
    },
    {
      runIndex: 2,
      scenarioName: DEFAULT_WASM_KERNEL_SCENARIO_NAME,
      passed: true,
      status: "passed",
      statusLabel: "通过",
      durationMs: 7,
      metrics: {
        probeTotalDurationMs: 6,
        mainThreadInitDurationMs: 2,
        mainThreadTotalDurationMs: 2,
        workerInitDurationMs: 4,
        workerTotalDurationMs: 4,
        consistentAcrossTransports: true,
        readinessOK: true,
      },
      stdoutTail: ["PASS"],
      stderrTail: [],
    },
    {
      runIndex: 3,
      scenarioName: DEFAULT_WASM_KERNEL_SCENARIO_NAME,
      passed: false,
      status: "failed",
      statusLabel: "失败",
      durationMs: 9,
      metrics: {
        probeTotalDurationMs: 8,
        mainThreadInitDurationMs: 3,
        mainThreadTotalDurationMs: 3,
        workerInitDurationMs: 6,
        workerTotalDurationMs: 6,
        consistentAcrossTransports: false,
        readinessOK: false,
      },
      stdoutTail: [],
      stderrTail: ["FAIL"],
    },
  ];
}

describe("Wasm Kernel Smoke", () => {
  it("should parse default and explicit args", () => {
    const defaults = parseWasmKernelSmokeArgs([]);
    assert.equal(defaults.repeats, 3);
    assert.equal(defaults.scenarioName, DEFAULT_WASM_KERNEL_SCENARIO_NAME);

    const explicit = parseWasmKernelSmokeArgs([
      "--repeats",
      "5",
      "--scenario",
      "custom scenario",
    ]);
    assert.equal(explicit.repeats, 5);
    assert.equal(explicit.scenarioName, "custom scenario");
  });

  it("should build smoke command via npm scenario entrypoint", () => {
    const command = buildWasmKernelSmokeCommand({
      projectRootPath: "/tmp/addon-template",
      scenarioName: DEFAULT_WASM_KERNEL_SCENARIO_NAME,
    });

    assert.ok(command.bin === "npm" || command.bin === "npm.cmd");
    assert.deepEqual(command.args, [
      "run",
      "zotero:scenario",
      "--",
      "--scenario",
      DEFAULT_WASM_KERNEL_SCENARIO_NAME,
    ]);
    assert.equal(command.cwd, "/tmp/addon-template");
  });

  it("should reject invalid args", () => {
    assert.throws(() => parseWasmKernelSmokeArgs(["--repeats", "0"]));
    assert.throws(() => parseWasmKernelSmokeArgs(["--scenario", ""]));
  });

  it("should summarize repeated runs and timing medians", () => {
    const report = summarizeWasmKernelSmokeReport({
      scenarioName: DEFAULT_WASM_KERNEL_SCENARIO_NAME,
      repeats: 3,
      runs: buildRuns(),
      assets: buildAssetInventory(),
    });

    assert.equal(report.status, "failed");
    assert.equal(report.passedRunCount, 2);
    assert.equal(report.failedRunCount, 1);
    assert.equal(report.metrics.scenarioDurationMsMedian, 7);
    assert.equal(report.metrics.probeTotalDurationMsMedian, 6);
    assert.equal(report.metrics.mainThreadTotalDurationMsMedian, 2);
    assert.equal(report.metrics.workerTotalDurationMsMedian, 4);
    assert.equal(report.consistentAcrossTransportsCount, 2);
    assert.equal(report.readinessOKCount, 2);
    assert.ok(report.summary.includes("失败 1 次"));
  });

  it("should mark a non-zero child process as failed instead of trusting a prior artifact", async () => {
    const run = await runSingleWasmKernelSmokeIteration({
      projectRootPath: "/tmp/addon-template",
      runIndex: 1,
      scenarioName: DEFAULT_WASM_KERNEL_SCENARIO_NAME,
      executeScenarioRun: null,
      spawnScenarioProcess: () => ({
        status: 1,
        stdout: "stale stdout",
        stderr: "listen EPERM: operation not permitted 0.0.0.0",
      }),
      readScenarioReport: async () => ({
        generatedAt: new Date().toISOString(),
        results: [{
          name: DEFAULT_WASM_KERNEL_SCENARIO_NAME,
          status: "passed",
          durationMs: 4,
          details: {
            timingSummary: {
              totalDurationMs: 4,
            },
          },
        }],
      }),
      statScenarioReport: async () => ({
        mtimeMs: Date.now(),
      }),
    });

    assert.equal(run.passed, false);
    assert.equal(run.status, "failed");
    assert.equal(run.processStatus, 1);
    assert.equal(run.failure?.failedStage, "run-scenario");
    assert.ok(run.details && Object.keys(run.details).length === 0);
  });

  it("should reuse the library scenario runner and record fresh successful results", async () => {
    const generatedAt = new Date().toISOString();
    const scenarioReport = {
      generatedAt,
      results: [{
        name: DEFAULT_WASM_KERNEL_SCENARIO_NAME,
        status: "passed",
        durationMs: 6,
        details: {
          rootURI: "jar:file:///tmp/cleanroom.xpi!/",
          timingSummary: {
            totalDurationMs: 6,
          },
          mainThread: {
            timing: {
              initDurationMs: 2,
              totalDurationMs: 2,
            },
          },
          worker: {
            timing: {
              initDurationMs: 4,
              totalDurationMs: 4,
            },
          },
          consistentAcrossTransports: true,
          readiness: {
            ok: true,
          },
        },
      }],
    };

    const run = await runSingleWasmKernelSmokeIteration({
      projectRootPath: "/tmp/addon-template",
      runIndex: 1,
      scenarioName: DEFAULT_WASM_KERNEL_SCENARIO_NAME,
      executeScenarioRun: async () => ({
        processLogs: [
          {
            source: "zotero.stdout",
            message: "[zotero:scenario] PASS wasm kernel probe diagnostics (6ms)",
          },
        ],
        scenarioResult: {
          failed: 0,
          execution: {
            incomplete: false,
          },
        },
        scenarioReport,
        reportPaths: {
          jsonPath: "/tmp/addon-template/dist/zotero-scenario-last-run.json",
        },
      }),
      readScenarioReport: async () => scenarioReport,
      statScenarioReport: async () => ({
        mtimeMs: Date.now(),
      }),
    });

    assert.equal(run.passed, true);
    assert.equal(run.status, "passed");
    assert.equal(run.processStatus, 0);
    assert.ok(run.stdoutTail.some((line) => line.includes("PASS wasm kernel probe diagnostics")));
    assert.equal(run.artifact?.fresh, true);
  });

  it("should reject stale scenario artifacts even when the child process succeeds", async () => {
    const startedAt = Date.now();
    let error = null;
    try {
      await inspectWasmKernelScenarioArtifact({
        artifacts: {
          scenarioLastRunJSON: "/tmp/addon-template/dist/zotero-scenario-last-run.json",
        },
        startedAt,
        scenarioName: DEFAULT_WASM_KERNEL_SCENARIO_NAME,
        runIndex: 2,
        readScenarioReport: async () => ({
          generatedAt: new Date(startedAt - 60_000).toISOString(),
          results: [{
            name: DEFAULT_WASM_KERNEL_SCENARIO_NAME,
            status: "passed",
            durationMs: 4,
            details: {},
          }],
        }),
        statScenarioReport: async () => ({
          mtimeMs: startedAt - 60_000,
        }),
      });
    } catch (caught) {
      error = caught;
    }

    assert.ok(error);
    assert.equal(error.scriptErrorCategory, "validation");
    assert.equal(error.failedStage, "read-scenario-last-run");
    assert.ok(String(error.message || "").includes("stale"));
  });

  it("should persist smoke artifacts", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wasm-kernel-smoke-"));
    try {
      const report = summarizeWasmKernelSmokeReport({
        scenarioName: DEFAULT_WASM_KERNEL_SCENARIO_NAME,
        repeats: 2,
        runs: buildRuns().slice(0, 2),
        assets: buildAssetInventory(),
      });
      const paths = await persistWasmKernelSmokeReport(report, {
        projectRootPath: projectRoot,
      });

      assert.ok(fs.existsSync(paths.reportPath));
      assert.ok(fs.existsSync(paths.reportMDPath));
      assert.ok(fs.existsSync(paths.latestJSONPath));
      assert.ok(fs.existsSync(paths.latestMDPath));
      assert.ok(fs.existsSync(paths.archiveJSONPath));
      assert.ok(fs.existsSync(paths.archiveMDPath));
      const markdown = fs.readFileSync(paths.reportMDPath, "utf-8");
      assert.ok(markdown.includes("Wasm Kernel Smoke"));
      assert.ok(markdown.includes("Runs"));
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("should keep default probe smoke aliases while persisting digest artifacts separately", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wasm-kernel-smoke-split-"));
    try {
      const probeReport = summarizeWasmKernelSmokeReport({
        scenarioName: DEFAULT_WASM_KERNEL_SCENARIO_NAME,
        repeats: 2,
        runs: buildRuns().slice(0, 2),
        assets: buildAssetInventory(),
      });
      await persistWasmKernelSmokeReport(probeReport, {
        projectRootPath: projectRoot,
      });

      const digestReport = summarizeWasmKernelSmokeReport({
        scenarioName: DEFAULT_WASM_KERNEL_DIGEST_SCENARIO_NAME,
        repeats: 2,
        runs: buildRuns().slice(0, 2).map((run) => ({
          ...run,
          scenarioName: DEFAULT_WASM_KERNEL_DIGEST_SCENARIO_NAME,
        })),
        assets: buildAssetInventory(),
      });
      const digestPaths = await persistWasmKernelSmokeReport(digestReport, {
        projectRootPath: projectRoot,
      });

      const defaultProbeReport = JSON.parse(fs.readFileSync(path.join(projectRoot, "dist", "wasm-kernel-smoke.json"), "utf-8"));
      const digestScenarioReport = JSON.parse(fs.readFileSync(digestPaths.reportPath, "utf-8"));
      assert.equal(defaultProbeReport.scenarioName, DEFAULT_WASM_KERNEL_SCENARIO_NAME);
      assert.equal(digestScenarioReport.scenarioName, DEFAULT_WASM_KERNEL_DIGEST_SCENARIO_NAME);
      assert.ok(fs.existsSync(path.join(projectRoot, "dist", "wasm-kernel-probe-smoke.json")));
      assert.ok(fs.existsSync(path.join(projectRoot, "dist", "wasm-kernel-digest-smoke.json")));
      assert.equal(digestPaths.defaultReportPath, null);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("should render per-run timing details", () => {
    const markdown = renderWasmKernelSmokeMarkdown(summarizeWasmKernelSmokeReport({
      scenarioName: DEFAULT_WASM_KERNEL_SCENARIO_NAME,
      repeats: 2,
      runs: buildRuns().slice(0, 2),
      assets: buildAssetInventory(),
    }));

    assert.ok(markdown.includes("Main-thread total/init"));
    assert.ok(markdown.includes("Worker total/init"));
  });
});
