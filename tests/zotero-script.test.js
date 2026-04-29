import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import { createScenarioLastRunReport, main, parseCli } from "../scripts/zotero.mjs";
import {
  buildScenarioLastRunMarkdown,
  filterRegisteredScenarios,
  filterScenarioFiles,
  initializeScenarioRegistry,
} from "../scripts/zotero-scenario-runner-lib.mjs";

describe("Zotero Script", () => {
  it("should parse scenario listing and filter flags", () => {
    const parsed = parseCli([
      "scenario",
      "--list-scenarios",
      "--scenario",
      "menu surface smoke",
      "--scenario-file",
      "reader-*",
    ]);

    assert.equal(parsed.mode, "scenario");
    assert.equal(parsed.listScenarios, true);
    assert.equal(parsed.scenarioPattern, "menu surface smoke");
    assert.equal(parsed.scenarioFilePattern, "reader-*");
  });

  it("should reject scenario-only flags outside scenario mode", () => {
    assert.throws(() => parseCli([
      "test",
      "--scenario",
      "menu surface smoke",
    ]), /only supported in scenario mode/);
  });

  it("should retain selected scenario results in the last-run artifact", () => {
    const report = createScenarioLastRunReport({
      result: {
        total: 1,
        passed: 1,
        failed: 0,
        skipped: 0,
        results: [
          {
            name: "wasm kernel probe diagnostics",
            status: "passed",
            durationMs: 7,
            details: {
              timingSummary: {
                totalDurationMs: 7,
              },
            },
          },
        ],
        failedResults: [],
        selectedScenarios: [
          {
            name: "wasm kernel probe diagnostics",
            sourceFile: "zotero-scenarios/wasm-kernel-probe.scenario.js",
          },
        ],
        execution: {
          registered: ["wasm kernel probe diagnostics"],
          selected: ["wasm kernel probe diagnostics"],
          completed: ["wasm kernel probe diagnostics"],
          filtersApplied: {
            scenario: "wasm kernel probe diagnostics",
            scenarioFile: null,
            listOnly: false,
          },
        },
      },
    });

    assert.equal(report.total, 1);
    assert.equal(report.passed, 1);
    assert.equal(report.results[0]?.details?.timingSummary?.totalDurationMs, 7);
    const markdown = buildScenarioLastRunMarkdown(report);
    assert.ok(markdown.includes("Selected Results"));
    assert.ok(markdown.includes("wasm kernel probe diagnostics"));
  });

  it("should filter scenario files and names in a stable order", () => {
    const projectRoot = "/tmp/addon-template";
    const fileSelection = filterScenarioFiles({
      projectRoot,
      scenarioFiles: [
        "/tmp/addon-template/zotero-scenarios/menu-surface-smoke.scenario.js",
        "/tmp/addon-template/zotero-scenarios/reader-event-hooks.scenario.js",
        "/tmp/addon-template/zotero-scenarios/reader-surface-smoke.scenario.js",
      ],
      scenarioFilePattern: "reader-*",
    });

    assert.deepEqual(fileSelection.selected.map((entry) => entry.relativePath), [
      "zotero-scenarios/reader-event-hooks.scenario.js",
      "zotero-scenarios/reader-surface-smoke.scenario.js",
    ]);

    const scenarioSelection = filterRegisteredScenarios({
      registeredScenarios: [
        { name: "reader event hook diagnostics" },
        { name: "reader surface smoke" },
        { name: "menu surface smoke" },
      ],
      scenarioPattern: "surface smoke",
    });

    assert.deepEqual(scenarioSelection.selected.map((entry) => entry.name), [
      "reader surface smoke",
      "menu surface smoke",
    ]);
  });

  it("should exclude explicitly advisory scenarios from the selected scenario list", () => {
    const scenarioSelection = filterRegisteredScenarios({
      registeredScenarios: [
        { name: "performance budget diagnostics" },
        { name: "preference pane control interaction" },
        { name: "reader surface smoke" },
      ],
      excludeScenarioNames: ["performance budget diagnostics"],
    });

    assert.deepEqual(scenarioSelection.selected.map((entry) => entry.name), [
      "preference pane control interaction",
      "reader surface smoke",
    ]);
    assert.deepEqual(scenarioSelection.excludedNames, [
      "performance budget diagnostics",
    ]);
  });

  it("should fail fast when scenario file filters match nothing", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cleanroom-zotero-script-"));
    const scenarioDir = path.join(projectRoot, "zotero-scenarios");
    fs.mkdirSync(scenarioDir, { recursive: true });
    fs.writeFileSync(
      path.join(scenarioDir, "menu-surface-smoke.scenario.js"),
      "registerZoteroScenario('menu surface smoke', async () => ({}));\n",
      "utf-8",
    );

    let error = null;
    try {
      await initializeScenarioRegistry({
        projectRoot,
        rdp: {
          async evaluateInChrome() {
            throw new Error("evaluateInChrome should not be called when file selection is empty");
          },
        },
        config: {
          addonId: "cleanroom-template@example.com",
          addonName: "Cleanroom Template",
          addonRef: "cleanroomtemplate",
          instanceKey: "CleanroomTemplate",
        },
        scenarioFilePattern: "reader-*",
      });
    }
    catch (caught) {
      error = caught;
    }
    finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }

    assert.ok(error);
    assert.equal(error.failedStage, "select-scenario-files");
    assert.equal(error.details?.scenarioFilePattern, "reader-*");
  });

  it("should short-circuit scenario mode through runScenarioMode without entering generic launch flow", async () => {
    let runScenarioModeCalls = 0;
    await main([
      "scenario",
      "--scenario",
      "wasm kernel probe diagnostics",
    ], {
      buildAddonImpl() {
        throw new Error("buildAddon should not be called for scenario mode");
      },
      async runScenarioModeImpl(options) {
        runScenarioModeCalls += 1;
        assert.equal(options.projectRootPath.endsWith("AddonTemplate4Z"), true);
        assert.equal(options.skipPackage, false);
        assert.equal(options.listScenarios, false);
        assert.equal(options.scenarioPattern, "wasm kernel probe diagnostics");
        assert.equal(options.scenarioFilePattern, null);
        return {
          scenarioResult: {
            failed: 0,
            execution: {
              incomplete: false,
            },
          },
        };
      },
      assertScenarioBatchPassedImpl(result) {
        assert.equal(result.failed, 0);
        assert.equal(result.execution.incomplete, false);
      },
    });

    assert.equal(runScenarioModeCalls, 1);
  });

  it("should pass the full addon config into the scenario runtime", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cleanroom-zotero-script-"));
    const scenarioDir = path.join(projectRoot, "zotero-scenarios");
    fs.mkdirSync(scenarioDir, { recursive: true });
    fs.writeFileSync(
      path.join(scenarioDir, "preferences-control-interaction.scenario.js"),
      "registerZoteroScenario('preference pane control interaction', async () => ({}));\n",
      "utf-8",
    );

    let chromeExpression = null;
    try {
      await initializeScenarioRegistry({
        projectRoot,
        rdp: {
          async evaluateInChrome(expression) {
            chromeExpression = expression;
            return JSON.stringify({
              registeredScenarios: [
                {
                  name: "preference pane control interaction",
                  sourceFileHref: "file:///preferences-control-interaction.scenario.js",
                },
              ],
              execution: {
                registeredScenarioNames: ["preference pane control interaction"],
              },
            });
          },
        },
        config: {
          addonId: "cleanroom-template@example.com",
          addonName: "Cleanroom Template",
          addonRef: "cleanroomtemplate",
          addonVersion: "0.1.0",
          instanceKey: "CleanroomTemplate",
          prefsPrefix: "extensions.zotero.cleanroomtemplate",
          defaultPrefs: {
            enabled: true,
            menuLabel: "",
            logLevel: "info",
          },
        },
      });
    }
    finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }

    assert.equal(typeof chromeExpression, "string");
    assert.ok(chromeExpression.includes("\"prefsPrefix\":\"extensions.zotero.cleanroomtemplate\""));
    assert.ok(chromeExpression.includes("\"defaultPrefs\":{\"enabled\":true,\"menuLabel\":\"\",\"logLevel\":\"info\"}"));
  });

  it("should allow an environment override for the curated pdf manifest path in scenario runtime config", async () => {
    const previousOverride = process.env.CLEANROOM_PDF_TEST_CORPUS_MANIFEST_PATH;
    process.env.CLEANROOM_PDF_TEST_CORPUS_MANIFEST_PATH = "/tmp/custom-curated.json";

    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cleanroom-zotero-script-"));
    const scenarioDir = path.join(projectRoot, "zotero-scenarios");
    fs.mkdirSync(scenarioDir, { recursive: true });
    fs.writeFileSync(
      path.join(scenarioDir, "curated-pdf-import.scenario.js"),
      "registerZoteroScenario('curated pdf corpus import smoke', async () => ({}));\n",
      "utf-8",
    );

    let chromeExpression = null;
    try {
      await initializeScenarioRegistry({
        projectRoot,
        rdp: {
          async evaluateInChrome(expression) {
            chromeExpression = expression;
            return JSON.stringify({
              registeredScenarios: [
                {
                  name: "curated pdf corpus import smoke",
                  sourceFileHref: "file:///curated-pdf-import.scenario.js",
                },
              ],
              execution: {
                registeredScenarioNames: ["curated pdf corpus import smoke"],
              },
            });
          },
        },
        config: {
          addonId: "cleanroom-template@example.com",
          addonName: "Cleanroom Template",
          addonRef: "cleanroomtemplate",
          addonVersion: "0.1.0",
          instanceKey: "CleanroomTemplate",
        },
      });
    }
    finally {
      if (previousOverride === undefined) {
        delete process.env.CLEANROOM_PDF_TEST_CORPUS_MANIFEST_PATH;
      }
      else {
        process.env.CLEANROOM_PDF_TEST_CORPUS_MANIFEST_PATH = previousOverride;
      }
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }

    assert.equal(typeof chromeExpression, "string");
    assert.ok(chromeExpression.includes("\"defaultManifestPath\":\"/tmp/custom-curated.json\""));
  });
});
