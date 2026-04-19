import { describe, it, assert } from "./test-framework.js";
import {
  parsePackageProtectionWebcrackAuditArgs,
  summarizePackageProtectionWebcrackAudit,
} from "../scripts/package-protection-webcrack-audit.mjs";

describe("Package Protection Webcrack Audit", () => {
  it("should parse required args and optional flags", () => {
    const options = parsePackageProtectionWebcrackAuditArgs([
      "--variant",
      "shielded-jsconfuser-string",
      "--channel",
      "beta",
      "--timeout-ms",
      "20000",
      "--webcrack-bin",
      "/usr/local/bin/webcrack",
      "--jsconfuser-tool-path",
      "/tmp/js-confuser",
      "--jsconfuser-tool-entry",
      "dist/index.js",
      "--no-package",
    ]);

    assert.equal(options.variant, "shielded-jsconfuser-string");
    assert.equal(options.channel, "beta");
    assert.equal(options.timeoutMs, 20000);
    assert.equal(options.webcrackBin, "/usr/local/bin/webcrack");
    assert.equal(options.jsConfuserToolPath, "/tmp/js-confuser");
    assert.equal(options.jsConfuserToolEntry, "dist/index.js");
    assert.equal(options.packageFirst, false);
  });

  it("should accept descriptor-bind as a webcrack-only experiment variant alias", () => {
    const options = parsePackageProtectionWebcrackAuditArgs([
      "--variant",
      "descriptor-bind",
      "--channel",
      "stable",
    ]);

    assert.equal(options.variant, "shielded-descriptor-bind");
    assert.equal(options.channel, "stable");
  });

  it("should accept pref-bridge as a webcrack-only experiment variant alias", () => {
    const options = parsePackageProtectionWebcrackAuditArgs([
      "--variant",
      "pref-bridge",
      "--channel",
      "stable",
    ]);

    assert.equal(options.variant, "shielded-pref-bridge");
    assert.equal(options.channel, "stable");
  });

  it("should accept surface-scrub as a webcrack-only experiment variant alias", () => {
    const options = parsePackageProtectionWebcrackAuditArgs([
      "--variant",
      "surface-scrub",
      "--channel",
      "stable",
    ]);

    assert.equal(options.variant, "shielded-surface-scrub");
    assert.equal(options.channel, "stable");
  });

  it("should require a valid variant", () => {
    assert.throws(() => parsePackageProtectionWebcrackAuditArgs([
      "--channel",
      "stable",
    ]));
  });

  it("should summarize a timeout plus loader-only fallback as passed loader-only surface", () => {
    const report = summarizePackageProtectionWebcrackAudit({
      variant: "shielded",
      channel: "stable",
      xpi: {
        path: "/tmp/shielded.xpi",
        sizeBytes: 123,
      },
      extractedInput: {
        path: "/tmp/shielded.js",
        sizeBytes: 456,
      },
      primaryAttempt: {
        mode: "primary",
        ok: false,
        timedOut: true,
        exitCode: 1,
        durationMs: 10000,
        outputDir: "/tmp/primary",
        stdout: "",
        stderr: "Script execution timed out.",
        errorMessage: null,
        output: {
          present: false,
          totalFileCount: 0,
          jsFileCount: 0,
          totalSizeBytes: 0,
        },
      },
      fallbackAttempt: {
        mode: "fallback-loader",
        ok: true,
        timedOut: false,
        exitCode: 0,
        durationMs: 250,
        outputDir: "/tmp/fallback",
        stdout: "",
        stderr: "",
        errorMessage: null,
        output: {
          present: true,
          totalFileCount: 1,
          jsFileCount: 1,
          totalSizeBytes: 1024,
        },
      },
      semanticScan: {
        presentAnchors: [],
        totalMatchCount: 0,
      },
      loaderScan: {
        presentAnchors: [
          {
            id: "bootstrap-plugin",
            label: "bootstrapPlugin",
            count: 1,
          },
        ],
        totalMatchCount: 1,
      },
    });

    assert.equal(report.status, "passed");
    assert.equal(report.suggestedWebcrackRating, "parse-fail / only-loader");
    assert.equal(report.effectiveOutputSource, "fallback-loader");
  });

  it("should summarize semantic anchor exposure as high-level architecture", () => {
    const report = summarizePackageProtectionWebcrackAudit({
      variant: "shielded-jsconfuser-string",
      channel: "stable",
      xpi: {
        path: "/tmp/shielded-jsconfuser-string.xpi",
        sizeBytes: 123,
      },
      extractedInput: {
        path: "/tmp/shielded-jsconfuser-string.js",
        sizeBytes: 456,
      },
      primaryAttempt: {
        mode: "primary",
        ok: true,
        timedOut: false,
        exitCode: 0,
        durationMs: 1500,
        outputDir: "/tmp/primary",
        stdout: "",
        stderr: "",
        errorMessage: null,
        output: {
          present: true,
          totalFileCount: 3,
          jsFileCount: 3,
          totalSizeBytes: 4096,
        },
      },
      fallbackAttempt: null,
      semanticScan: {
        presentAnchors: [
          {
            id: "run-agent-action",
            label: "runAgentAction",
            count: 2,
          },
        ],
        totalMatchCount: 2,
      },
      loaderScan: {
        presentAnchors: [
          {
            id: "bootstrap-plugin",
            label: "bootstrapPlugin",
            count: 1,
          },
        ],
        totalMatchCount: 1,
      },
    });

    assert.equal(report.status, "attention");
    assert.equal(report.suggestedWebcrackRating, "high-level-architecture");
    assert.equal(report.nextAction, "agent-review-semantic-output");
  });
});
