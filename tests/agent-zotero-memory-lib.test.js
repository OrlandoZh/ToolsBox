import { describe, it, assert } from "./test-framework.js";
import {
  buildMemoryMarkdown,
  buildMemoryReport,
  parseMemoryArgs,
  summarizeMemoryReport,
} from "../scripts/agent-zotero-memory-lib.mjs";

function memorySnapshot({ resident, explicit, ok = true } = {}) {
  return {
    ok,
    reporters: {
      resident,
      explicit,
    },
  };
}

function buildMemoryFixture() {
  return {
    aboutMemoryExport: {
      ok: true,
      source: "gecko-memory-reporter-manager.getReports",
      generatedAt: "2026-03-21T10:00:00.000Z",
      reporterCount: 2,
      text: "process: Main\npath: explicit\namount: 41943040\n\nprocess: Main\npath: resident\namount: 104857600",
    },
    activities: [
      {
        actionId: "preferences.openPane",
        durationMs: 50,
        memory: {
          before: memorySnapshot({ resident: 100 * 1024 * 1024, explicit: 40 * 1024 * 1024 }),
          after: memorySnapshot({ resident: 112 * 1024 * 1024, explicit: 43 * 1024 * 1024 }),
        },
      },
      {
        actionId: "reader.sidebar.selectView",
        durationMs: 60,
        memory: {
          before: memorySnapshot({ resident: 112 * 1024 * 1024, explicit: 43 * 1024 * 1024 }),
          after: memorySnapshot({ resident: 116 * 1024 * 1024, explicit: 42 * 1024 * 1024 }),
        },
      },
    ],
  };
}

describe("Agent Zotero Memory Lib", () => {
  it("should build an advisory memory report with deltas", () => {
    const report = buildMemoryReport({
      memoryFixture: buildMemoryFixture(),
      generatedAt: "2026-03-21T10:00:00.000Z",
    });

    assert.equal(report.kind, "agent-zotero-memory");
    assert.equal(report.gateEffect, "non-blocking");
    assert.equal(report.status, "passed");
    assert.equal(report.successfulActivityCount, 2);
    assert.equal(report.rssBeforeMb, 100);
    assert.equal(report.rssAfterMb, 116);
    assert.equal(report.rssDeltaMb, 16);
    assert.equal(report.residentDeltaMb, 16);
    assert.equal(report.explicitDeltaMb, 2);
    assert.equal(report.aboutMemoryExport.included, true);
    assert.equal(report.aboutMemoryExport.ok, true);
    assert.equal(report.aboutMemoryExport.reporterCount, 2);
    assert.equal(report.aboutMemoryExport.text, undefined);
    assert.equal(report.topGrowingAction.actionId, "preferences.openPane");
    assert.ok(buildMemoryMarkdown(report).includes("about:memory export"));
  });

  it("should retain about:memory text only when requested for sidecar export", () => {
    const report = buildMemoryReport({
      memoryFixture: buildMemoryFixture(),
      includeAboutMemory: true,
      generatedAt: "2026-03-21T10:00:00.000Z",
    });

    assert.equal(report.includeAboutMemory, true);
    assert.equal(report.aboutMemoryExport.ok, true);
    assert.ok(report.aboutMemoryExport.text.includes("path: explicit"));
  });

  it("should keep failed memory snapshots advisory", () => {
    const report = buildMemoryReport({
      memoryFixture: {
        activities: [
          {
            actionId: "itemPane.selectPane",
            memory: {
              before: memorySnapshot({ ok: false }),
              after: memorySnapshot({ ok: false }),
              error: { message: "memory reporter unavailable" },
            },
          },
        ],
      },
    });

    assert.equal(report.status, "attention");
    assert.equal(report.successfulActivityCount, 0);
    assert.equal(report.failedActivityCount, 1);
    assert.ok(buildMemoryMarkdown(report).includes("memory reporter unavailable"));
  });

  it("should build compact summaries for monitor and dashboard", () => {
    const report = buildMemoryReport({
      memoryFixture: buildMemoryFixture(),
      generatedAt: "2026-03-21T10:00:00.000Z",
    });
    const summary = summarizeMemoryReport(report, {
      reportJSON: "/tmp/agent-zotero-memory.json",
      reportMD: "/tmp/agent-zotero-memory.md",
      now: new Date("2026-03-21T10:05:00.000Z"),
    });

    assert.equal(summary.present, true);
    assert.equal(summary.status, "passed");
    assert.equal(summary.rssDeltaMb, 16);
    assert.equal(summary.residentDeltaMb, 16);
    assert.equal(summary.explicitDeltaMb, 2);
    assert.equal(summary.aboutMemoryExport.ok, true);
    assert.equal(summary.aboutMemoryExport.reporterCount, 2);
    assert.equal(summary.ageText, "5 分钟");
  });

  it("should summarize missing and invalid memory reports as advisory evidence", () => {
    const missing = summarizeMemoryReport(null, {
      reportJSON: "/tmp/agent-zotero-memory.json",
      reportMD: "/tmp/agent-zotero-memory.md",
    });
    const invalid = summarizeMemoryReport(null, {
      parseError: "Unexpected token",
    });

    assert.equal(missing.present, false);
    assert.equal(missing.status, "missing");
    assert.equal(missing.gateEffect, "non-blocking");
    assert.equal(invalid.present, false);
    assert.equal(invalid.status, "attention");
    assert.ok(invalid.summary.includes("无法解析"));
  });

  it("should parse CLI arguments", () => {
    const parsed = parseMemoryArgs([
      "--scenario",
      "custom memory",
      "--include-details",
      "--include-about-memory",
      "--duration-ms",
      "250",
      "--memory-fixture",
      "/tmp/memory.json",
      "--skip-build",
    ]);

    assert.equal(parsed.scenario, "custom memory");
    assert.equal(parsed.includeDetails, true);
    assert.equal(parsed.includeAboutMemory, true);
    assert.equal(parsed.durationMs, 250);
    assert.equal(parsed.memoryFixture, "/tmp/memory.json");
    assert.equal(parsed.skipBuild, true);
  });
});
