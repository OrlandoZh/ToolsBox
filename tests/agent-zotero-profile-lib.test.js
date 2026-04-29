import { describe, it, assert } from "./test-framework.js";
import {
  analyzeProfilerData,
  buildProfileMarkdown,
  buildProfileReport,
  parseProfileArgs,
  parseProfilerData,
  summarizeProfileReport,
} from "../scripts/agent-zotero-profile-lib.mjs";

function buildProfileFixture({ objectSchema = false } = {}) {
  const samplesSchema = objectSchema
    ? { stack: 0, threadCPUDelta: 1 }
    : ["stack", "threadCPUDelta"];
  const stackSchema = objectSchema
    ? { prefix: 0, frame: 1 }
    : ["prefix", "frame"];
  const frameSchema = objectSchema
    ? { location: 0 }
    : ["location"];

  return {
    threads: [
      {
        name: "GeckoMain",
        samples: {
          schema: samplesSchema,
          data: [
            [1, 7],
            [2, 5],
            [3, 3],
            [4, 2],
            [null, 1],
          ],
        },
        stackTable: {
          schema: stackSchema,
          data: [
            [null, 0],
            [0, 1],
            [0, 2],
            [0, 3],
            [0, 4],
          ],
        },
        frameTable: {
          schema: frameSchema,
          data: [
            [0],
            [1],
            [2],
            [3],
            [4],
          ],
        },
        stringTable: [
          "root",
          "chrome://cleanroomtemplate/content/index.js",
          "resource://zotero/reader/pdf.js",
          "resource://zotero/note-editor/editor.js",
          "chrome://zotero/content/zoteroPane.js",
        ],
      },
    ],
  };
}

describe("Agent Zotero Profile Lib", () => {
  it("should parse profiler schemas in array form", () => {
    const parsed = parseProfilerData(buildProfileFixture());

    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].sampleCount, 5);
    assert.equal(parsed[0].totalCpuTime, 18);
    assert.equal(parsed[0].stacks[0].cpuTime, 7);
    assert.ok(parsed[0].stacks[0].callStack.includes("chrome://cleanroomtemplate"));
  });

  it("should parse profiler schemas in object form", () => {
    const parsed = parseProfilerData(buildProfileFixture({ objectSchema: true }));

    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].totalCpuTime, 18);
    assert.ok(parsed[0].stacks.some((stack) => stack.callStack.includes("resource://zotero/reader")));
  });

  it("should bucket current plugin and Zotero surfaces", () => {
    const analysis = analyzeProfilerData(buildProfileFixture(), {
      addonRef: "cleanroomtemplate",
      addonId: "cleanroom-template@example.com",
      currentPluginKeys: ["chrome://cleanroomtemplate/"],
    });
    const buckets = new Map(analysis.buckets.map((bucket) => [bucket.id, bucket]));

    assert.equal(analysis.totalCpuTime, 18);
    assert.equal(buckets.get("current-plugin").cpuTime, 7);
    assert.equal(buckets.get("zotero-reader").cpuTime, 5);
    assert.equal(buckets.get("zotero-note-editor").cpuTime, 3);
    assert.equal(buckets.get("zotero-main").cpuTime, 2);
  });

  it("should build advisory reports when profiler data is missing", () => {
    const report = buildProfileReport({
      scenarioResult: {
        results: [
          {
            name: "profiler diagnostics",
            status: "passed",
            details: {
              activities: [
                {
                  actionId: "preferences.openPane",
                  durationMs: 10,
                  profile: {
                    ok: false,
                    error: {
                      message: "Services.profiler unavailable",
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    });

    assert.equal(report.advisory, true);
    assert.equal(report.gateEffect, "non-blocking");
    assert.equal(report.status, "attention");
    assert.equal(report.successfulActivityCount, 0);
    assert.ok(buildProfileMarkdown(report).includes("Services.profiler unavailable"));
  });

  it("should build a compact profile summary for monitor and dashboard", () => {
    const report = buildProfileReport({
      profileData: buildProfileFixture(),
      profileContext: {
        addonRef: "cleanroomtemplate",
        addonId: "cleanroom-template@example.com",
      },
      generatedAt: "2026-03-21T10:00:00.000Z",
    });
    const summary = summarizeProfileReport(report, {
      reportJSON: "/tmp/agent-zotero-profile.json",
      reportMD: "/tmp/agent-zotero-profile.md",
      now: new Date("2026-03-21T10:05:00.000Z"),
    });

    assert.equal(summary.present, true);
    assert.equal(summary.status, "passed");
    assert.equal(summary.activityCount, 1);
    assert.equal(summary.successfulActivityCount, 1);
    assert.equal(summary.failedActivityCount, 0);
    assert.equal(summary.totalCpuTime, 18);
    assert.equal(summary.currentPluginCpuPercent, 38.89);
    assert.equal(summary.unknownCpuPercent, 0);
    assert.equal(summary.topBucket?.label, "Current Plugin");
    assert.equal(summary.topAction?.actionId, "fixture.profile");
    assert.equal(summary.gateEffect, "non-blocking");
    assert.equal(summary.ageText, "5 分钟");
  });

  it("should summarize missing and invalid profile reports as advisory evidence", () => {
    const missing = summarizeProfileReport(null, {
      reportJSON: "/tmp/agent-zotero-profile.json",
      reportMD: "/tmp/agent-zotero-profile.md",
    });
    const invalid = summarizeProfileReport(null, {
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
    const parsed = parseProfileArgs([
      "--scenario",
      "custom profiler",
      "--include-details",
      "--duration-ms",
      "250",
      "--profile-fixture",
      "/tmp/profile.json",
      "--skip-build",
    ]);

    assert.equal(parsed.scenario, "custom profiler");
    assert.equal(parsed.includeDetails, true);
    assert.equal(parsed.durationMs, 250);
    assert.equal(parsed.profileFixture, "/tmp/profile.json");
    assert.equal(parsed.skipBuild, true);
  });
});
