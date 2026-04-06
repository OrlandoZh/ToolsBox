import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import { parseCli } from "../scripts/zotero.mjs";
import {
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
});
