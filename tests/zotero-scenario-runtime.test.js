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
  createScenarioHelpers,
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

  it("should report curated pdf corpus availability without failing when the manifest is missing", async () => {
    const { sandbox, exports } = loadScenarioRuntime();
    sandbox.IOUtils = {
      async exists() {
        return false;
      },
    };

    const runtime = exports.createScenarioHelpers({
      Zotero: sandbox.Zotero,
      Services: sandbox.Services,
      ChromeUtils: sandbox.ChromeUtils,
      addonConfig: {
        instanceKey: "TestPlugin",
        cleanroomPdfTestCorpus: {
          defaultManifestPath: "/tmp/missing-curated.json",
        },
      },
      plugin: sandbox.Zotero.TestPlugin,
    });

    const status = await runtime.helpers.getCuratedPDFCorpusStatus();

    assert.equal(status.available, false);
    assert.equal(status.errorKind, "missing-manifest");
    assert.equal(status.manifestPath, "/tmp/missing-curated.json");
  });

  it("should import a curated pdf corpus entry and create a metadata parent item", async () => {
    const { sandbox, exports } = loadScenarioRuntime();
    const manifestPath = "/tmp/curated.json";
    const sourceFilePath = "/tmp/core-entry.pdf";
    const items = new Map();
    const importedCalls = [];
    let nextItemID = 1;

    class MockItem {
      constructor(itemType) {
        this.itemType = itemType;
        this.fields = {};
        this.creators = [];
        this.tags = [];
        this.id = null;
      }

      setField(field, value) {
        this.fields[field] = value;
      }

      setCreators(creators) {
        this.creators = creators;
      }

      setCollections(collections) {
        this.collections = collections;
      }

      addTag(tag) {
        this.tags.push(tag);
      }

      async saveTx() {
        if (!this.id) {
          this.id = nextItemID++;
          items.set(this.id, this);
        }
        return this.id;
      }

      async eraseTx() {
        items.delete(this.id);
        this.erased = true;
      }

      getField(field) {
        return this.fields[field] || "";
      }
    }

    sandbox.Zotero.Item = MockItem;
    sandbox.Zotero.Items = {
      get(itemID) {
        return items.get(itemID) || null;
      },
    };
    sandbox.Zotero.Attachments = {
      async importFromFile(args) {
        importedCalls.push(args);
        const attachment = {
          id: nextItemID++,
          parentItemID: args.parentItemID,
          title: args.title,
          async eraseTx() {
            items.delete(attachment.id);
          },
        };
        items.set(attachment.id, attachment);
        return attachment;
      },
    };
    sandbox.IOUtils = {
      async exists(targetPath) {
        return targetPath === manifestPath || targetPath === sourceFilePath;
      },
      async readUTF8(targetPath) {
        if (targetPath !== manifestPath) {
          throw new Error(`Unexpected read: ${targetPath}`);
        }
        return JSON.stringify({
          groups: [
            {
              id: "core-text-smoke",
              label: "Core Text Smoke",
              reason: "Core entry",
              entries: [
                {
                  id: "pdf-core",
                  fileName: "core-entry.pdf",
                  relativePath: "core-entry.pdf",
                  absolutePath: sourceFilePath,
                  familyKey: "core-entry",
                  recommendedLane: "core-text",
                  variantKind: "original",
                  resolvedMetadata: {
                    title: "Core Entry Title",
                    author: "Ada Lovelace",
                    doi: "10.1000/core",
                    journal: "Cleanroom Journal",
                  },
                },
              ],
            },
          ],
        });
      },
      async remove() {},
    };

    const runtime = exports.createScenarioHelpers({
      Zotero: sandbox.Zotero,
      Services: sandbox.Services,
      ChromeUtils: sandbox.ChromeUtils,
      addonConfig: {
        instanceKey: "TestPlugin",
        cleanroomPdfTestCorpus: {
          defaultManifestPath: manifestPath,
        },
      },
      plugin: sandbox.Zotero.TestPlugin,
    });

    const status = await runtime.helpers.getCuratedPDFCorpusStatus();
    assert.equal(status.available, true);
    assert.equal(status.groupCount, 1);
    assert.equal(status.entryCount, 1);

    const imported = await runtime.helpers.importCuratedPDF({
      createParentItem: true,
    });

    assert.equal(imported.group.id, "core-text-smoke");
    assert.equal(imported.entry.id, "pdf-core");
    assert.equal(imported.sourceFilePath, sourceFilePath);
    assert.equal(imported.parentItem.itemType, "journalArticle");
    assert.equal(imported.parentItem.getField("title"), "Core Entry Title");
    assert.equal(imported.parentItem.getField("publicationTitle"), "Cleanroom Journal");
    assert.equal(imported.parentItem.getField("DOI"), "10.1000/core");
    assert.deepEqual(imported.parentItem.creators, [
      {
        creatorType: "author",
        name: "Ada Lovelace",
      },
    ]);
    assert.deepEqual(importedCalls, [
      {
        file: sourceFilePath,
        parentItemID: imported.parentItem.id,
        title: "Core Entry Title",
        contentType: "application/pdf",
      },
    ]);

    await runtime.cleanup();
    assert.equal(items.size, 0);
  });
});
