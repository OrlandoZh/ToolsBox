import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  inspectWasmKernelDisabledContract,
  inspectWasmKernelLazySourceContract,
  inspectWasmKernelPackageScriptContract,
  parseWasmKernelDisabledContractArgs,
  persistWasmKernelDisabledContractReport,
  renderWasmKernelDisabledContractMarkdown,
} from "../scripts/wasm-kernel-disabled-contract-report.mjs";
import { DEFAULT_WASM_KERNEL_DIGEST_SCENARIO_NAME } from "../scripts/wasm-kernel-performance-report.mjs";

function writeJSON(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

function createFixtureProject() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wasm-disabled-contract-"));
  const exportRoot = path.join(projectRoot, "dist", "cleanroomtemplate-0.1.0-pure-project");

  writeJSON(path.join(projectRoot, "config", "addon.config.json"), {
    addonName: "Cleanroom Template",
    addonRef: "cleanroomtemplate",
    addonVersion: "0.1.0",
  });

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
      check: "npm run lint && npm test",
      "wasm:kernel:smoke": "node scripts/wasm-kernel-smoke.mjs",
      "wasm:kernel:perf": "node scripts/wasm-kernel-performance-report.mjs",
      "wasm:kernel:disabled-contract": "node scripts/wasm-kernel-disabled-contract-report.mjs",
      "wasm:kernel:matrix": "node scripts/wasm-kernel-matrix-report.mjs",
    },
  });

  writeText(path.join(projectRoot, "src", "app", "plugin.js"), `
export function createPlugin({ createWasmKernelProbeImpl } = {}) {
  let wasmKernelProbe = null;
  function getWasmKernelProbe() {
    if (!wasmKernelProbe) {
      wasmKernelProbe = createWasmKernelProbeImpl({});
    }
    return wasmKernelProbe;
  }
  const hostActions = createHostActionRunner({
    getWasmKernelProbe,
  });
  return {
    stopServices: async () => {
      if (typeof wasmKernelProbe?.close === "function") {
        await wasmKernelProbe.close();
      }
    },
    hostActions,
  };
}
`);

  writeText(path.join(projectRoot, "dev", "agent-runtime", "host-actions.js"), `
export function createHostActionRunner({
  wasmKernelProbe,
  getWasmKernelProbe,
}) {
  async function resolveWasmKernelProbe() {
    if (typeof getWasmKernelProbe === "function") {
      return await getWasmKernelProbe();
    }
    return wasmKernelProbe || null;
  }
  async function runRuntimeDeriveWasmKernelDigest(payload = {}) {
    const resolvedWasmKernelProbe = await resolveWasmKernelProbe();
    return resolvedWasmKernelProbe.deriveDigest(payload);
  }
  const readiness = typeof getWasmKernelProbe === "function" || typeof wasmKernelProbe?.runProbe === "function";
  const digestReadiness = typeof getWasmKernelProbe === "function" || typeof wasmKernelProbe?.deriveDigest === "function";
  return {
    readiness,
    digestReadiness,
    resolveWasmKernelProbe,
    runRuntimeDeriveWasmKernelDigest,
  };
}
`);

  writeText(path.join(projectRoot, "src", "services", "wasm-loader.js"), "export function loadWasm() {}\n");
  writeText(path.join(projectRoot, "src", "services", "wasm-worker.js"), "export function createWasmWorker() {}\n");
  writeText(path.join(projectRoot, "src", "features", "wasm-kernel-probe.js"), "export function createWasmKernelProbe() {}\n");
  writeText(path.join(projectRoot, "scripts", "wasm-kernel-smoke.mjs"), "export {};\n");
  writeText(path.join(projectRoot, "scripts", "wasm-kernel-performance-report.mjs"), "export {};\n");
  writeText(path.join(projectRoot, "scripts", "wasm-kernel-disabled-contract-report.mjs"), "export {};\n");
  writeText(path.join(projectRoot, "scripts", "wasm-kernel-matrix-report.mjs"), "export {};\n");

  writeText(path.join(projectRoot, "addon-static", "content", "lib", "w", "probe.wasm"), "wasm");
  writeText(path.join(projectRoot, "addon-static", "content", "lib", "w", "wasm-probe-worker.js"), "worker");
  writeText(path.join(projectRoot, "build", "cleanroomtemplate", "content", "lib", "w", "probe.wasm"), "wasm");
  writeText(path.join(projectRoot, "build", "cleanroomtemplate", "content", "lib", "w", "wasm-probe-worker.js"), "worker");

  writeJSON(path.join(projectRoot, "dist", "wasm-kernel-smoke.json"), {
    scenarioName: "wasm kernel probe diagnostics",
    repeats: 3,
    passedRunCount: 3,
    failedRunCount: 0,
    status: "passed",
    summary: "all passed",
    metrics: {
      mainThreadTotalDurationMsMedian: 1,
      workerTotalDurationMsMedian: 4,
      probeTotalDurationMsMedian: 5,
    },
  });

  writeJSON(path.join(projectRoot, "dist", "wasm-kernel-performance.json"), {
    artifactSource: "wasm-kernel-smoke",
    summary: "performance snapshot",
    overall: {
      probeTotalDurationMs: {
        median: 5,
      },
    },
    transports: {
      mainThread: {
        totalDurationMs: {
          median: 1,
        },
      },
      worker: {
        totalDurationMs: {
          median: 4,
        },
      },
    },
  });

  writeJSON(path.join(exportRoot, "export-manifest.json"), {
    optionalBundles: [
      {
        id: "wasm-kernel",
        enabled: false,
        implementationStatus: "planned",
      },
    ],
  });
  writeJSON(path.join(exportRoot, "package.json"), {
    scripts: {
      "wasm:kernel:smoke": "node scripts/wasm-kernel-smoke.mjs",
      "wasm:kernel:perf": "node scripts/wasm-kernel-performance-report.mjs",
      "wasm:kernel:disabled-contract": "node scripts/wasm-kernel-disabled-contract-report.mjs",
      "wasm:kernel:matrix": "node scripts/wasm-kernel-matrix-report.mjs",
    },
  });
  writeText(path.join(exportRoot, "README.md"), "run wasm:kernel:disabled-contract and wasm:kernel:matrix after build/export/smoke\n");

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
    writeText(path.join(exportRoot, relativePath), relativePath.endsWith(".json") ? "{}\n" : "fixture\n");
  });

  return {
    projectRoot,
    exportRoot,
  };
}

describe("Wasm Kernel Disabled Contract Report", () => {
  it("should parse default and explicit args", () => {
    const defaults = parseWasmKernelDisabledContractArgs([]);
    assert.ok(path.isAbsolute(defaults.projectRootPath));
    assert.ok(defaults.projectRootPath.length > 0);
    assert.equal(defaults.exportRootPath, null);
    assert.equal(defaults.scenarioName, "wasm kernel probe diagnostics");

    const explicit = parseWasmKernelDisabledContractArgs([
      "--project-root",
      "/tmp/project",
      "--export-root",
      "/tmp/export",
      "--smoke-report",
      "/tmp/smoke.json",
      "--performance-report",
      "/tmp/perf.json",
      "--scenario",
      "custom",
    ]);
    assert.equal(explicit.projectRootPath, "/tmp/project");
    assert.equal(explicit.exportRootPath, "/tmp/export");
    assert.equal(explicit.smokeReportPath, "/tmp/smoke.json");
    assert.equal(explicit.performanceReportPath, "/tmp/perf.json");
    assert.equal(explicit.scenarioName, "custom");
  });

  it("should inspect package and lazy source contracts", () => {
    const packageContract = inspectWasmKernelPackageScriptContract({
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
    assert.equal(packageContract.checks.every((entry) => entry.ok), true);

    const lazyContract = inspectWasmKernelLazySourceContract({
      pluginSource: `
        let wasmKernelProbe = null;
        function getWasmKernelProbe() {
          if (!wasmKernelProbe) {
            wasmKernelProbe = createWasmKernelProbeImpl({});
          }
          return wasmKernelProbe;
        }
        createHostActionRunner({ getWasmKernelProbe });
        if (typeof wasmKernelProbe?.close === "function") {}
      `,
      hostActionsSource: `
        export function createHostActionRunner({ wasmKernelProbe, getWasmKernelProbe }) {}
        async function resolveWasmKernelProbe() {
          if (typeof getWasmKernelProbe === "function") {
            return await getWasmKernelProbe();
          }
          return wasmKernelProbe || null;
        }
        const ready = typeof getWasmKernelProbe === "function" || typeof wasmKernelProbe?.runProbe === "function";
        const digestReady = typeof getWasmKernelProbe === "function" || typeof wasmKernelProbe?.deriveDigest === "function";
        async function runRuntimeDeriveWasmKernelDigest(payload = {}) {
          const resolvedWasmKernelProbe = await resolveWasmKernelProbe();
          return resolvedWasmKernelProbe.deriveDigest(payload);
        }
      `,
    });
    assert.equal(lazyContract.checks.every((entry) => entry.ok), true);
  });

  it("should build a passing disabled-contract report from a minimal fixture", async () => {
    const fixture = createFixtureProject();
    const report = await inspectWasmKernelDisabledContract(fixture.projectRoot, {
      exportRootPath: fixture.exportRoot,
    });

    assert.equal(report.scenarioName, "wasm kernel probe diagnostics");
    assert.equal(report.status, "passed");
    assert.equal(report.failedChecks.length, 0);
    assert.equal(report.assets.source.combinedBytes, 10);
    assert.equal(report.smokeEvidence.metrics.mainThreadTotalDurationMsMedian, 1);
    assert.equal(report.performanceSnapshot.mainThreadMedianMs, 1);
    assert.ok(report.summary.includes("planned + default-disabled"));

    const paths = await persistWasmKernelDisabledContractReport(report, {
      projectRootPath: fixture.projectRoot,
    });
    assert.ok(fs.existsSync(paths.reportPath));
    assert.ok(fs.existsSync(paths.latestMDPath));

    const markdown = renderWasmKernelDisabledContractMarkdown(report);
    assert.ok(markdown.includes("Wasm Kernel Disabled Contract"));
    assert.ok(markdown.includes("wasm:kernel:disabled-contract"));
    assert.ok(markdown.includes("wasm:kernel:matrix"));
    assert.ok(markdown.includes("wasm kernel probe diagnostics"));
  });

  it("should persist digest disabled-contract artifacts without overwriting the default probe alias", async () => {
    const fixture = createFixtureProject();
    const probeReport = await inspectWasmKernelDisabledContract(fixture.projectRoot, {
      exportRootPath: fixture.exportRoot,
    });
    await persistWasmKernelDisabledContractReport(probeReport, {
      projectRootPath: fixture.projectRoot,
    });

    writeJSON(path.join(fixture.projectRoot, "dist", "wasm-kernel-digest-smoke.json"), {
      scenarioName: DEFAULT_WASM_KERNEL_DIGEST_SCENARIO_NAME,
      repeats: 3,
      passedRunCount: 3,
      failedRunCount: 0,
      status: "passed",
      summary: "digest passed",
      metrics: {
        mainThreadTotalDurationMsMedian: 1,
        workerTotalDurationMsMedian: 5,
        probeTotalDurationMsMedian: 7,
      },
    });
    writeJSON(path.join(fixture.projectRoot, "dist", "wasm-kernel-digest-performance.json"), {
      artifactSource: "wasm-kernel-smoke",
      summary: "digest performance snapshot",
      overall: {
        probeTotalDurationMs: {
          median: 7,
        },
      },
      transports: {
        mainThread: {
          totalDurationMs: {
            median: 1,
          },
        },
        worker: {
          totalDurationMs: {
            median: 5,
          },
        },
      },
    });

    const digestReport = await inspectWasmKernelDisabledContract(fixture.projectRoot, {
      exportRootPath: fixture.exportRoot,
      scenarioName: DEFAULT_WASM_KERNEL_DIGEST_SCENARIO_NAME,
    });
    const digestPaths = await persistWasmKernelDisabledContractReport(digestReport, {
      projectRootPath: fixture.projectRoot,
    });

    const defaultReport = JSON.parse(fs.readFileSync(path.join(fixture.projectRoot, "dist", "wasm-kernel-disabled-contract.json"), "utf-8"));
    const digestScenarioReport = JSON.parse(fs.readFileSync(digestPaths.reportPath, "utf-8"));
    assert.equal(defaultReport.scenarioName, "wasm kernel probe diagnostics");
    assert.equal(digestScenarioReport.scenarioName, DEFAULT_WASM_KERNEL_DIGEST_SCENARIO_NAME);
    assert.ok(fs.existsSync(path.join(fixture.projectRoot, "dist", "wasm-kernel-digest-disabled-contract.json")));
    assert.equal(digestPaths.defaultReportPath, null);
  });

  it("should fail when exported disabled-contract script is missing", async () => {
    const fixture = createFixtureProject();
    fs.rmSync(path.join(fixture.exportRoot, "scripts", "wasm-kernel-disabled-contract-report.mjs"));

    const report = await inspectWasmKernelDisabledContract(fixture.projectRoot, {
      exportRootPath: fixture.exportRoot,
    });

    assert.equal(report.status, "failed");
    assert.ok(report.failedChecks.some((entry) => entry.name === "export.file.scripts/wasm-kernel-disabled-contract-report.mjs"));
  });
});
