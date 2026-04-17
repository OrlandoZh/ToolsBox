import { describe, it, assert } from "./test-framework.js";
import {
  buildJSConfuserAstScramblerProfile,
  buildJSConfuserTargetedStringConcealingProfile,
  buildJSConfuserSemanticDelta,
  buildPackageProtectionJSConfuserAttemptStatus,
  parsePackageProtectionJSConfuserPreflightArgs,
  resolvePackageProtectionJSConfuserReportBasename,
  resolveJSConfuserPreflightProfile,
  resolveJSConfuserTargetAnchorNeedles,
  resolveJSConfuserEntryRelativePath,
  summarizePackageProtectionJSConfuserPreflight,
} from "../scripts/package-protection-jsconfuser-preflight.mjs";
import { buildPackageProtectionAuditAnchors, scanBundleAnchors } from "../scripts/package-protection-anchor-audit.mjs";

describe("Package Protection JS-Confuser Preflight", () => {
  it("should parse tool path, source proxy mode, bundle path and optional tool entry", () => {
    const options = parsePackageProtectionJSConfuserPreflightArgs([
      "--tool-path",
      "/tmp/js-confuser",
      "--tool-entry",
      "dist/index.js",
      "--source-proxy-mode",
      "protected",
      "--bundle-path",
      "build/cleanroomtemplate/content/scripts/cleanroomtemplate.js",
    ]);

    assert.equal(options.toolPath, "/tmp/js-confuser");
    assert.equal(options.toolEntry, "dist/index.js");
    assert.equal(options.sourceProxyMode, "protected");
    assert.equal(options.bundlePath, "build/cleanroomtemplate/content/scripts/cleanroomtemplate.js");
  });

  it("should parse targeted string concealing args", () => {
    const options = parsePackageProtectionJSConfuserPreflightArgs([
      "--tool-path",
      "/tmp/js-confuser",
      "--profile",
      "targeted-string-concealing",
      "--target-anchor",
      "run-agent-action",
      "--target-string",
      "custom-token",
    ]);

    assert.equal(options.profile, "targeted-string-concealing");
    assert.deepEqual(options.targetAnchors, ["run-agent-action"]);
    assert.deepEqual(options.targetStrings, ["custom-token"]);
  });

  it("should require a tool path", () => {
    assert.throws(() => parsePackageProtectionJSConfuserPreflightArgs([]));
  });

  it("should build the non-hostile astScrambler profile", () => {
    assert.deepEqual(buildJSConfuserAstScramblerProfile(), {
      target: "browser",
      astScrambler: true,
      stringConcealing: false,
      pack: false,
      rgf: false,
      lock: {
        antiDebug: false,
        tamperProtection: false,
      },
    });
  });

  it("should build the targeted string concealing profile", () => {
    assert.deepEqual(buildJSConfuserTargetedStringConcealingProfile({
      targetAnchors: ["run-agent-action"],
      targetStrings: ["runAgentAction", "entrypoints"],
    }), {
      target: "browser",
      astScrambler: false,
      stringConcealing: "substring-match-targeted",
      stringConcealingTargetAnchors: ["run-agent-action"],
      stringConcealingTargetStrings: ["runAgentAction", "entrypoints"],
      pack: false,
      rgf: false,
      lock: {
        antiDebug: false,
        tamperProtection: false,
      },
    });
  });

  it("should resolve entry candidates from package metadata", () => {
    const candidates = resolveJSConfuserEntryRelativePath({
      module: "dist/index.mjs",
      main: "dist/index.cjs",
      exports: {
        ".": {
          import: "./dist/browser.mjs",
          default: "./dist/browser-default.mjs",
        },
      },
    });

    assert.deepEqual(candidates.slice(0, 4), [
      "dist/index.mjs",
      "dist/index.cjs",
      "./dist/browser.mjs",
      "./dist/browser-default.mjs",
    ]);
  });

  it("should resolve target anchor ids into audit needles", () => {
    const anchors = buildPackageProtectionAuditAnchors({
      addonRef: "demo-addon",
      addonVersion: "1.2.3",
    });

    const resolved = resolveJSConfuserTargetAnchorNeedles([
      "run-agent-action",
      "capability-entrypoints",
    ], anchors);

    assert.deepEqual(resolved.resolvedAnchors, [
      "run-agent-action",
      "capability-entrypoints",
    ]);
    assert.deepEqual(resolved.resolvedTargetStrings, [
      "runAgentAction",
      "entrypoints",
    ]);
  });

  it("should build default targeted string concealing profile from audit anchors", () => {
    const anchors = buildPackageProtectionAuditAnchors({
      addonRef: "demo-addon",
      addonVersion: "1.2.3",
    });

    const profile = resolveJSConfuserPreflightProfile({
      profile: "targeted-string-concealing",
      targetAnchors: [],
      targetStrings: [],
    }, anchors);

    assert.equal(profile.stringConcealing, "substring-match-targeted");
    assert.equal(profile.astScrambler, false);
    assert.ok(profile.stringConcealingTargetAnchors.includes("run-agent-action"));
    assert.ok(profile.stringConcealingTargetAnchors.includes("optional-ai-service"));
    assert.ok(profile.stringConcealingTargetStrings.includes("runAgentAction"));
    assert.ok(profile.stringConcealingTargetStrings.includes("ai-service"));
  });

  it("should use a distinct report basename for targeted string concealing", () => {
    assert.equal(resolvePackageProtectionJSConfuserReportBasename({
      requestedProfile: buildJSConfuserAstScramblerProfile(),
    }), "package-protection-jsconfuser-preflight");

    assert.equal(resolvePackageProtectionJSConfuserReportBasename({
      requestedProfile: buildJSConfuserTargetedStringConcealingProfile({
        targetAnchors: ["run-agent-action"],
        targetStrings: ["runAgentAction"],
      }),
    }), "package-protection-jsconfuser-string-preflight");
  });

  it("should compute semantic delta only from semantic anchor categories", () => {
    const anchors = buildPackageProtectionAuditAnchors({
      addonRef: "demo-addon",
      addonVersion: "1.2.3",
    });
    const inputScan = scanBundleAnchors(
      "plugin.api.agent.inspectItem() runAgentAction() entrypoints ownedBy successSignals sourceSHA256 demo-addon",
      anchors,
    );
    const outputScan = scanBundleAnchors(
      "sourceSHA256 demo-addon",
      anchors,
    );

    const delta = buildJSConfuserSemanticDelta(inputScan, outputScan);
    assert.equal(delta.inputAnchorCount >= 4, true);
    assert.equal(delta.outputAnchorCount, 0);
    assert.equal(delta.reducedAnchorCount >= 4, true);
    assert.ok(delta.removedAnchorIds.includes("plugin-api-agent-surface"));
    assert.ok(delta.removedAnchorIds.includes("run-agent-action"));
  });

  it("should mark successful output without semantic reduction as attention", () => {
    const status = buildPackageProtectionJSConfuserAttemptStatus({
      succeeded: true,
      syntaxCheckPassed: true,
      inputBytes: 100,
      outputBytes: 140,
      semanticDelta: {
        reducedAnchorCount: 0,
        reducedMatchCount: 0,
      },
    });

    assert.equal(status, "attention");
  });

  it("should mark oversized output as attention even when semantic reduction exists", () => {
    const status = buildPackageProtectionJSConfuserAttemptStatus({
      succeeded: true,
      syntaxCheckPassed: true,
      inputBytes: 100,
      outputBytes: 350,
      semanticDelta: {
        reducedAnchorCount: 3,
        reducedMatchCount: 4,
      },
    });

    assert.equal(status, "attention");
  });

  it("should summarize a promising astScrambler preflight as passed", () => {
    const report = summarizePackageProtectionJSConfuserPreflight({
      toolInfo: {
        toolPath: "/tmp/js-confuser",
        entryPath: "/tmp/js-confuser/dist/index.js",
        entryRelativePath: "dist/index.js",
        packageJSON: {
          name: "js-confuser",
          version: "1.0.0",
        },
      },
      sourceProxyMode: "plain",
      bundlePath: "/tmp/input.js",
      profile: buildJSConfuserAstScramblerProfile(),
      attempt: {
        succeeded: true,
        syntaxCheckPassed: true,
        durationMs: 42,
        exitCode: 0,
        apiShape: "default-obfuscate",
        inputBytes: 100,
        output: {
          bytes: 180,
          inputScan: {
            anchors: [
              { id: "plugin-api-agent-surface", category: "inner-bundle-semantics", present: true, count: 3 },
              { id: "run-agent-action", category: "inner-bundle-semantics", present: true, count: 2 },
            ],
          },
          outputScan: {
            anchors: [
              { id: "plugin-api-agent-surface", category: "inner-bundle-semantics", present: false, count: 0 },
              { id: "run-agent-action", category: "inner-bundle-semantics", present: false, count: 0 },
            ],
          },
        },
      },
    });

    assert.equal(report.status, "passed");
    assert.equal(report.nextAction, "run-zotero-smoke-ab");
    assert.equal(report.tool.apiShape, "default-obfuscate");
    assert.equal(report.semanticDelta.reducedAnchorCount, 2);
  });

  it("should summarize a no-gain astScrambler preflight as attention", () => {
    const report = summarizePackageProtectionJSConfuserPreflight({
      toolInfo: {
        toolPath: "/tmp/js-confuser",
        entryPath: "/tmp/js-confuser/dist/index.js",
        entryRelativePath: "dist/index.js",
        packageJSON: {
          name: "js-confuser",
          version: "1.0.0",
        },
      },
      sourceProxyMode: "plain",
      bundlePath: "/tmp/input.js",
      profile: buildJSConfuserAstScramblerProfile(),
      attempt: {
        succeeded: true,
        syntaxCheckPassed: true,
        durationMs: 42,
        exitCode: 0,
        apiShape: "default-obfuscate",
        inputBytes: 100,
        output: {
          bytes: 180,
          inputScan: {
            anchors: [
              { id: "plugin-api-agent-surface", category: "inner-bundle-semantics", present: true, count: 3 },
            ],
          },
          outputScan: {
            anchors: [
              { id: "plugin-api-agent-surface", category: "inner-bundle-semantics", present: true, count: 3 },
            ],
          },
        },
      },
    });

    assert.equal(report.status, "attention");
    assert.equal(report.nextAction, "not-promising-for-semantics");
    assert.equal(report.semanticDelta.reducedAnchorCount, 0);
  });

  it("should summarize a promising targeted string concealing preflight as passed", () => {
    const report = summarizePackageProtectionJSConfuserPreflight({
      toolInfo: {
        toolPath: "/tmp/js-confuser",
        entryPath: "/tmp/js-confuser/dist/index.js",
        entryRelativePath: "dist/index.js",
        packageJSON: {
          name: "js-confuser",
          version: "1.0.0",
        },
      },
      sourceProxyMode: "plain",
      bundlePath: "/tmp/input.js",
      profile: buildJSConfuserTargetedStringConcealingProfile({
        targetAnchors: ["run-agent-action"],
        targetStrings: ["runAgentAction"],
      }),
      attempt: {
        succeeded: true,
        syntaxCheckPassed: true,
        durationMs: 42,
        exitCode: 0,
        apiShape: "default-obfuscate",
        inputBytes: 100,
        output: {
          bytes: 180,
          inputScan: {
            anchors: [
              { id: "run-agent-action", category: "inner-bundle-semantics", present: true, count: 2 },
            ],
          },
          outputScan: {
            anchors: [
              { id: "run-agent-action", category: "inner-bundle-semantics", present: false, count: 0 },
            ],
          },
        },
      },
    });

    assert.equal(report.status, "passed");
    assert.equal(report.nextAction, "run-zotero-smoke-ab");
    assert.ok(report.summary.includes("targeted stringConcealing"));
  });
});
