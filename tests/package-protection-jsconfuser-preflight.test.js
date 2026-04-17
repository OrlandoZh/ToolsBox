import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  buildJSConfuserDiscoveryRoots,
  buildJSConfuserAstScramblerProfile,
  buildJSConfuserTargetedStringConcealingProfile,
  buildJSConfuserSemanticDelta,
  buildPackageProtectionJSConfuserAttemptStatus,
  discoverJSConfuserToolPath,
  ensureJSConfuserToolReady,
  parsePackageProtectionJSConfuserPreflightArgs,
  resolveJSConfuserToolSelection,
  resolvePackageProtectionJSConfuserReportBasename,
  resolveJSConfuserPreflightProfile,
  resolveNearestNodeModulesPath,
  resolveJSConfuserTargetAnchorNeedles,
  resolveJSConfuserEntryRelativePath,
  summarizePackageProtectionJSConfuserPreflight,
} from "../scripts/package-protection-jsconfuser-preflight.mjs";
import { buildPackageProtectionAuditAnchors, scanBundleAnchors } from "../scripts/package-protection-anchor-audit.mjs";

function writeRunnableJSConfuserCandidate(toolRoot, version = "0.0.0-test") {
  fs.mkdirSync(path.join(toolRoot, "node_modules"), { recursive: true });
  fs.mkdirSync(path.join(toolRoot, "dist"), { recursive: true });
  fs.writeFileSync(path.join(toolRoot, "package.json"), `${JSON.stringify({
    name: "js-confuser",
    version,
    main: "dist/index.js",
  }, null, 2)}\n`, "utf-8");
  fs.writeFileSync(
    path.join(toolRoot, "dist", "index.js"),
    "exports.obfuscate = async function obfuscate(source) { return { code: String(source || '') }; };\n",
    "utf-8",
  );
}

function writeStubJSConfuserCandidate(toolRoot, version = "0.0.0-test") {
  fs.mkdirSync(path.join(toolRoot, "node_modules"), { recursive: true });
  fs.mkdirSync(path.join(toolRoot, "dist"), { recursive: true });
  fs.writeFileSync(path.join(toolRoot, "package.json"), `${JSON.stringify({
    name: "js-confuser",
    version,
    main: "dist/index.js",
  }, null, 2)}\n`, "utf-8");
  fs.writeFileSync(path.join(toolRoot, "dist", "index.js"), "export default {};\n", "utf-8");
}

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

  it("should allow omitted tool path so auto-discovery can run later", () => {
    const options = parsePackageProtectionJSConfuserPreflightArgs([]);
    assert.equal(options.toolPath, null);
  });

  it("should build stable discovery roots near the workspace and home", () => {
    const roots = buildJSConfuserDiscoveryRoots({
      projectRootPath: "/tmp/workspace/repo",
      env: {
        HOME: "/tmp/home",
      },
    });

    assert.ok(roots.includes(path.resolve("/tmp/workspace/repo/dist/package-protection-tools/js-confuser")));
    assert.ok(roots.includes(path.resolve("/tmp/workspace/repo/dist/package-protection-tools/js-confuser/node_modules/js-confuser")));
    assert.ok(roots.includes(path.resolve("/tmp/workspace/repo")));
    assert.ok(roots.includes(path.resolve("/tmp/home/Downloads")));
    assert.ok(roots.includes(path.resolve(os.tmpdir())));
    assert.ok(roots.includes(path.resolve("/tmp")));
  });

  it("should prioritize workspace and home discovery roots before temp fallbacks", () => {
    const roots = buildJSConfuserDiscoveryRoots({
      projectRootPath: "/tmp/workspace/repo",
      env: {
        HOME: "/tmp/home",
        TMPDIR: "/tmp/custom-temp",
      },
    });

    assert.ok(
      roots.indexOf(path.resolve("/tmp/workspace")) < roots.indexOf(path.resolve("/tmp/home/.openclaw/workspace-coding")),
    );
    assert.ok(
      roots.indexOf(path.resolve("/tmp/home/.openclaw/workspace-coding/projects/GitHub")) < roots.indexOf(path.resolve("/tmp/custom-temp")),
    );
    assert.ok(
      roots.indexOf(path.resolve("/tmp/home/Downloads")) < roots.indexOf(path.resolve("/tmp")),
    );
  });

  it("should resolve nearest reachable node_modules path", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jsconfuser-node-modules-"));
    const toolRoot = path.join(root, "node_modules", "js-confuser");
    fs.mkdirSync(toolRoot, { recursive: true });

    const resolved = await resolveNearestNodeModulesPath(toolRoot);
    assert.equal(resolved, path.join(root, "node_modules"));
  });

  it("should discover a local js-confuser checkout from common roots", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jsconfuser-discovery-"));
    const checkoutRoot = path.join(root, "projects", "GitHub", "js-confuser");
    writeRunnableJSConfuserCandidate(checkoutRoot);

    const discovered = await discoverJSConfuserToolPath({
      projectRootPath: path.join(root, "workspace", "repo"),
      env: {
        HOME: root,
      },
    });

    assert.equal(discovered.toolPath, checkoutRoot);
    assert.equal(discovered.toolEntry, "dist/index.js");
    assert.equal(discovered.discovered, true);
  });

  it("should fall back to auto-discovery when no explicit tool path is provided", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jsconfuser-selection-"));
    const checkoutRoot = path.join(root, ".openclaw", "workspace-coding", "projects", "GitHub", "js-confuser");
    writeRunnableJSConfuserCandidate(checkoutRoot);

    const selected = await resolveJSConfuserToolSelection({
      projectRootPath: path.join(root, "workspace", "repo"),
      env: {
        HOME: root,
      },
    });

    assert.equal(selected.discovered, true);
    assert.equal(path.basename(selected.toolPath), "js-confuser");
    assert.equal(selected.toolEntry, "dist/index.js");
    assert.equal(fs.existsSync(path.join(selected.toolPath, "package.json")), true);
  });

  it("should skip discovered candidates without a runnable entry and continue to the next candidate", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jsconfuser-discovery-ready-"));
    const invalidRoot = path.join(root, "workspace", "js-confuser");
    const validRoot = path.join(root, ".openclaw", "workspace-coding", "projects", "GitHub", "js-confuser");

    writeStubJSConfuserCandidate(invalidRoot);
    writeRunnableJSConfuserCandidate(validRoot);

    const discovered = await discoverJSConfuserToolPath({
      projectRootPath: path.join(root, "workspace", "repo"),
      env: {
        HOME: root,
      },
    });

    assert.equal(discovered.toolPath, validRoot);
    assert.equal(discovered.toolEntry, "dist/index.js");
    assert.equal(discovered.discovered, true);
  });

  it("should discover the default bootstrap install root before falling back to temp candidates", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jsconfuser-bootstrap-discovery-"));
    const projectRoot = path.join(root, "workspace", "repo");
    const bootstrapToolRoot = path.join(projectRoot, "dist", "package-protection-tools", "js-confuser", "node_modules", "js-confuser");
    const tempStubRoot = path.join(root, "tmp-candidates", "js-confuser");

    writeRunnableJSConfuserCandidate(bootstrapToolRoot, "2.0.1");
    writeStubJSConfuserCandidate(tempStubRoot, "2.0.1");

    const discovered = await discoverJSConfuserToolPath({
      projectRootPath: projectRoot,
      env: {
        HOME: path.join(root, "home"),
        TMPDIR: path.join(root, "tmp-candidates"),
      },
    });

    assert.equal(discovered.toolPath, path.resolve(bootstrapToolRoot));
    assert.equal(discovered.toolEntry, "dist/index.js");
  });

  it("should reject explicit tool paths whose entry is only a stub without obfuscate api", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jsconfuser-explicit-stub-"));
    const stubRoot = path.join(root, "js-confuser");
    writeStubJSConfuserCandidate(stubRoot);

    let error = null;
    try {
      await ensureJSConfuserToolReady(stubRoot);
    } catch (caught) {
      error = caught;
    }

    assert.ok(error, "expected ensureJSConfuserToolReady to reject stub entry");
    assert.match(String(error?.message || error), /supported js-confuser obfuscate API/);
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
