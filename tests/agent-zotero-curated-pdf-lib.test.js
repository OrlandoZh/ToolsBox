import { describe, it, assert } from "./test-framework.js";
import {
  buildCuratedPdfMarkdown,
  CURATED_PDF_DEFAULT_SCENARIO_NAMES,
  summarizeCuratedPdfManifest,
  summarizeCuratedPdfScenarioResults,
} from "../scripts/agent-zotero-curated-pdf-lib.mjs";

describe("Agent Zotero Curated PDF Lib", () => {
  it("should summarize a valid curated manifest with required groups", () => {
    const summary = summarizeCuratedPdfManifest({
      sourceRoot: "/tmp/corpus",
      profile: "balanced-v1",
      summary: {
        laneCounts: {
          "core-text": 1,
          "scan-ocr": 1,
          "permission-edge": 1,
        },
      },
      groups: [
        { id: "core-text-smoke", entries: [{ id: "a" }] },
        { id: "scan-ocr", entries: [{ id: "b" }] },
        { id: "permission-edge", entries: [{ id: "c" }] },
      ],
    }, {
      manifestPath: "/tmp/curated.json",
    });

    assert.equal(summary.manifestPath, "/tmp/curated.json");
    assert.equal(summary.groupCount, 3);
    assert.equal(summary.entryCount, 3);
    assert.deepEqual(summary.groupIDs, [
      "core-text-smoke",
      "scan-ocr",
      "permission-edge",
    ]);
  });

  it("should summarize curated scenario results as passed when all fixtures import", () => {
    const summary = summarizeCuratedPdfScenarioResults({
      results: CURATED_PDF_DEFAULT_SCENARIO_NAMES.map((name, index) => ({
        name,
        status: "passed",
        details: {
          fixtureStatus: "imported",
          groupID: ["core-text-smoke", "scan-ocr", "permission-edge"][index],
          entryID: `entry-${index + 1}`,
        },
      })),
      failed: 0,
    });

    assert.equal(summary.status, "passed");
    assert.equal(summary.importedScenarioNames.length, 3);
    assert.equal(summary.unavailableScenarioNames.length, 0);
    assert.equal(summary.failedScenarioNames.length, 0);
  });

  it("should summarize curated scenario results as unavailable when fixtures are missing", () => {
    const summary = summarizeCuratedPdfScenarioResults({
      results: CURATED_PDF_DEFAULT_SCENARIO_NAMES.map((name) => ({
        name,
        status: "passed",
        details: {
          fixtureStatus: "unavailable",
        },
      })),
      failed: 0,
    });

    assert.equal(summary.status, "unavailable");
    assert.equal(summary.unavailableScenarioNames.length, 3);
    assert.ok(summary.summary.includes("夹具"));
  });

  it("should render a compact markdown report", () => {
    const markdown = buildCuratedPdfMarkdown({
      status: "passed",
      manifestPath: "/tmp/curated.json",
      manifestSummary: {
        sourceRoot: "/tmp/corpus",
        groupCount: 3,
        entryCount: 3,
      },
      scenarioFilePattern: "curated-pdf",
      scenarioPattern: null,
      scenarioReportPath: "/tmp/zotero-scenario-last-run.json",
      scenarioSummary: {
        status: "passed",
        statusLabel: "通过",
        summary: "all good",
        importedScenarioNames: ["curated pdf corpus import smoke"],
        results: [
          {
            name: "curated pdf corpus import smoke",
            status: "passed",
            fixtureStatus: "imported",
            groupID: "core-text-smoke",
            entryID: "entry-1",
          },
        ],
      },
    });

    assert.ok(markdown.includes("Curated PDF Dev-Only Validation"));
    assert.ok(markdown.includes("core-text-smoke"));
    assert.ok(markdown.includes("/tmp/curated.json"));
  });
});
