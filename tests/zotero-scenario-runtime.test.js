import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { describe, it, assert } from "./test-framework.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function loadScenarioRuntime(scriptedFiles = new Map()) {
  const source = fs.readFileSync(
    path.join(projectRoot, "scripts", "zotero-scenario-runtime.js"),
    "utf-8",
  );
  const sandbox = {
    console,
    TextEncoder,
    Blob,
    setTimeout,
    clearTimeout,
    Zotero: {
      logError() {},
      TestPlugin: {
        api: {},
      },
    },
    Services: {
      scriptloader: {
        loadSubScript(fileHref, scope) {
          const script = scriptedFiles.get(fileHref);
          if (!script) {
            throw new Error(`Unknown scripted file: ${fileHref}`);
          }
          script(scope);
        },
      },
    },
    ChromeUtils: {},
    Components: {
      utils: {
        cloneInto(value) {
          return value;
        },
      },
      interfaces: {},
    },
  };
  sandbox.globalThis = sandbox;

  vm.runInNewContext(
    `${source}
this.__scenarioRuntimeExports = {
  createScenarioRuntimeState,
  createErrorPayload,
  runScenarioCase,
  snapshotScenarioExecution,
};`,
    sandbox,
    { filename: "zotero-scenario-runtime.js" },
  );

  return {
    sandbox,
    exports: sandbox.__scenarioRuntimeExports,
  };
}

describe("Zotero Scenario Runtime", () => {
  it("should allow the runtime harness to be loaded multiple times in the same global scope", () => {
    const source = fs.readFileSync(
      path.join(projectRoot, "scripts", "zotero-scenario-runtime.js"),
      "utf-8",
    );
    const sandbox = {
      console,
      TextEncoder,
      Blob,
      setTimeout,
      clearTimeout,
      Zotero: {
        logError() {},
        TestPlugin: {
          api: {},
        },
      },
      Services: {
        scriptloader: {
          loadSubScript() {},
        },
      },
      ChromeUtils: {},
      Components: {
        utils: {
          cloneInto(value) {
            return value;
          },
        },
        interfaces: {},
      },
    };
    sandbox.globalThis = sandbox;

    vm.runInNewContext(source, sandbox, { filename: "zotero-scenario-runtime.js" });
    assert.doesNotThrow(() => {
      vm.runInNewContext(source, sandbox, { filename: "zotero-scenario-runtime.js" });
    });
  });

  it("should register scenarios with their source file hrefs", async () => {
    const scriptedFiles = new Map([
      ["file:///alpha.scenario.js", (scope) => {
        scope.registerZoteroScenario("alpha scenario", async () => ({ ok: true }));
      }],
      ["file:///beta.scenario.js", (scope) => {
        scope.registerZoteroScenario("beta scenario", async () => ({ ok: true }));
      }],
    ]);
    const { sandbox } = loadScenarioRuntime(scriptedFiles);

    const payload = JSON.parse(await sandbox.loadCleanroomZoteroScenarios({
      fileHrefs: Array.from(scriptedFiles.keys()),
      addonConfig: {
        instanceKey: "TestPlugin",
      },
    }));

    assert.deepEqual(payload.registeredScenarios, [
      {
        name: "alpha scenario",
        sourceFileHref: "file:///alpha.scenario.js",
      },
      {
        name: "beta scenario",
        sourceFileHref: "file:///beta.scenario.js",
      },
    ]);
    assert.deepEqual(payload.execution.registeredScenarioNames, [
      "alpha scenario",
      "beta scenario",
    ]);
  });

  it("should run a single scenario and track execution metadata", async () => {
    const scriptedFiles = new Map([
      ["file:///alpha.scenario.js", (scope) => {
        scope.registerZoteroScenario("alpha scenario", async () => ({ ok: true, id: "alpha" }));
      }],
      ["file:///beta.scenario.js", (scope) => {
        scope.registerZoteroScenario("beta scenario", async () => ({ ok: true, id: "beta" }));
      }],
    ]);
    const { sandbox } = loadScenarioRuntime(scriptedFiles);
    await sandbox.loadCleanroomZoteroScenarios({
      fileHrefs: Array.from(scriptedFiles.keys()),
      addonConfig: {
        instanceKey: "TestPlugin",
      },
    });

    const payload = JSON.parse(await sandbox.runCleanroomZoteroScenarioByName({
      name: "alpha scenario",
      selectedScenarioNames: ["alpha scenario", "beta scenario"],
    }));

    assert.equal(payload.result.status, "passed");
    assert.equal(payload.result.details.id, "alpha");
    assert.equal(payload.execution.lastStartedScenario, "alpha scenario");
    assert.equal(payload.execution.lastCompletedScenario, "alpha scenario");
    assert.equal(payload.execution.completedCount, 1);
    assert.equal(payload.execution.failedCount, 0);
    assert.deepEqual(payload.execution.selectedScenarioNames, [
      "alpha scenario",
      "beta scenario",
    ]);
  });

  it("should classify helper timeouts with scenario metadata", async () => {
    const scriptedFiles = new Map([
      ["file:///timeout.scenario.js", (scope) => {
        scope.registerZoteroScenario("timeout scenario", async ({ helpers }) => {
          await helpers.waitFor(() => false, {
            timeoutMs: 1,
            message: "timeout from helper",
            step: "helper.wait",
          });
          return null;
        });
      }],
    ]);
    const { sandbox } = loadScenarioRuntime(scriptedFiles);
    await sandbox.loadCleanroomZoteroScenarios({
      fileHrefs: Array.from(scriptedFiles.keys()),
      addonConfig: {
        instanceKey: "TestPlugin",
      },
    });

    const payload = JSON.parse(await sandbox.runCleanroomZoteroScenarioByName({
      name: "timeout scenario",
      selectedScenarioNames: ["timeout scenario"],
    }));

    assert.equal(payload.result.status, "failed");
    assert.equal(payload.result.error.kind, "scenario-helper-timeout");
    assert.equal(payload.result.error.phase, "helper");
    assert.equal(payload.result.error.step, "helper.wait");
    assert.equal(payload.result.error.scenarioName, "timeout scenario");
  });

  it("should classify cleanup failures separately", async () => {
    const scriptedFiles = new Map([
      ["file:///cleanup.scenario.js", (scope) => {
        scope.registerZoteroScenario("cleanup scenario", async ({ helpers }) => {
          helpers.addCleanup(async () => {
            throw new Error("cleanup exploded");
          });
          return { ok: true };
        });
      }],
    ]);
    const { sandbox } = loadScenarioRuntime(scriptedFiles);
    await sandbox.loadCleanroomZoteroScenarios({
      fileHrefs: Array.from(scriptedFiles.keys()),
      addonConfig: {
        instanceKey: "TestPlugin",
      },
    });

    const payload = JSON.parse(await sandbox.runCleanroomZoteroScenarioByName({
      name: "cleanup scenario",
      selectedScenarioNames: ["cleanup scenario"],
    }));

    assert.equal(payload.result.status, "failed");
    assert.equal(payload.result.error.kind, "scenario-cleanup-failed");
    assert.equal(payload.result.error.phase, "cleanup");
    assert.equal(payload.result.error.step, "cleanup");
    assert.equal(payload.result.error.scenarioName, "cleanup scenario");
    assert.equal(payload.execution.failedCount, 1);
  });

  it("should normalize scenario dom contract payloads through the shared helper", async () => {
    const scriptedFiles = new Map([
      ["file:///dom-contract.scenario.js", (scope) => {
        scope.registerZoteroScenario("dom contract scenario", async ({ helpers }) => ({
          domContract: {
            routeId: "reader",
            adapter: "reader",
            checks: [
              helpers.createDomContractCheck("event-doc", true, {
                label: "reader event doc observed",
              }),
            ],
            summary: "reader dom contract ok",
          },
        }));
      }],
    ]);
    const { sandbox } = loadScenarioRuntime(scriptedFiles);
    await sandbox.loadCleanroomZoteroScenarios({
      fileHrefs: Array.from(scriptedFiles.keys()),
      addonConfig: {
        instanceKey: "TestPlugin",
      },
    });

    const payload = JSON.parse(await sandbox.runCleanroomZoteroScenarioByName({
      name: "dom contract scenario",
      selectedScenarioNames: ["dom contract scenario"],
    }));

    assert.equal(payload.result.status, "passed");
    assert.equal(payload.result.details.domContract.routeId, "reader");
    assert.equal(payload.result.details.domContract.status, "passed");
    assert.equal(payload.result.details.domContract.statusLabel, "通过");
    assert.equal(payload.result.details.domContract.checkCount, 1);
    assert.equal(payload.result.details.domContract.failedCheckCount, 0);
  });
});
