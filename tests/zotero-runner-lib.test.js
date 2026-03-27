/**
 * Zotero runner helper tests
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  buildStartupArgs,
  buildUserPrefs,
  diffWatchSnapshots,
  getDefaultWatchRoots,
  installProxyAddon,
  parseDotEnv,
  resolveRuntimePaths,
  serializeUserPrefs,
  unwrapRdpValue,
} from "../scripts/zotero-runner-lib.mjs";
import {
  buildScriptFailureInfo,
  createScriptError,
  normalizeScriptErrorCategory,
  pickScriptErrorCategoryLabel,
  SCRIPT_ERROR_CATEGORY_LABELS,
} from "../scripts/script-runtime-lib.mjs";

describe("Zotero Runner", () => {
  it("should parse dotenv content with comments and quotes", () => {
    const parsed = parseDotEnv(`
# comment
export ZOTERO_PLUGIN_ZOTERO_BIN_PATH="/Applications/Zotero.app/Contents/MacOS/zotero"
ZOTERO_PLUGIN_PROFILE_PATH='/tmp/profile'
ZOTERO_PLUGIN_RDP_PORT=64719
`);

    assert.equal(
      parsed.ZOTERO_PLUGIN_ZOTERO_BIN_PATH,
      "/Applications/Zotero.app/Contents/MacOS/zotero",
    );
    assert.equal(parsed.ZOTERO_PLUGIN_PROFILE_PATH, "/tmp/profile");
    assert.equal(parsed.ZOTERO_PLUGIN_RDP_PORT, "64719");
  });

  it("should build startup args with devtools and debugger server", () => {
    const args = buildStartupArgs({
      profilePath: "/tmp/profile",
      dataDir: "/tmp/data",
      rdpPort: 64719,
      devtools: true,
    });

    assert.deepEqual(args, [
      "--purgecaches",
      "-no-remote",
      "-profile",
      "/tmp/profile",
      "--dataDir",
      "/tmp/data",
      "-start-debugger-server",
      "64719",
      "--jsdebugger",
    ]);
  });

  it("should resolve default runtime paths inside the workspace", () => {
    const projectRoot = "/tmp/addon-template";
    const resolved = resolveRuntimePaths(projectRoot, "smoke");

    assert.equal(
      resolved.profilePath,
      path.join(projectRoot, ".zotero-runtime", "smoke", "profile"),
    );
    assert.equal(
      resolved.dataDir,
      path.join(projectRoot, ".zotero-runtime", "smoke", "data"),
    );
  });

  it("should serialize user prefs with escaped strings", () => {
    const prefs = buildUserPrefs({
      "extensions.zotero.cleanroomtemplate.label": 'Hello "Zotero"',
    });
    const output = serializeUserPrefs(prefs);

    assert.includes(output, 'user_pref("devtools.chrome.enabled", true);');
    assert.includes(
      output,
      'user_pref("extensions.zotero.cleanroomtemplate.label", "Hello \\"Zotero\\"");',
    );
  });

  it("should expose default watch roots and diff snapshots", () => {
    const roots = getDefaultWatchRoots();
    assert.deepEqual(roots, ["src", "addon-static", "config"]);

    const previous = new Map([
      ["src/main.js", "1:100"],
      ["config/addon.config.json", "1:200"],
    ]);
    const next = new Map([
      ["src/main.js", "2:100"],
      ["addon-static/bootstrap.js", "1:50"],
    ]);

    assert.deepEqual(diffWatchSnapshots(previous, next), [
      "addon-static/bootstrap.js",
      "config/addon.config.json",
      "src/main.js",
    ]);
  });

  it("should write a proxy install file into the profile extensions directory", async () => {
    const profilePath = fs.mkdtempSync(path.join(os.tmpdir(), "cleanroom-profile-"));
    const addonPath = "/tmp/cleanroom-addon";
    const addonId = "cleanroom-template@example.com";

    await installProxyAddon({
      profilePath,
      addonId,
      addonPath,
    });

    const proxyFile = path.join(profilePath, "extensions", addonId);
    const proxyTarget = fs.readFileSync(proxyFile, "utf-8");

    assert.equal(proxyTarget.trim(), addonPath);
    assert.notOk(fs.existsSync(path.join(profilePath, "extensions", `${addonId}.xpi`)));

    fs.rmSync(profilePath, { recursive: true, force: true });
  });

  it("should unwrap RDP preview objects into plain values", () => {
    const unwrapped = unwrapRdpValue({
      type: "object",
      class: "Object",
      preview: {
        ownProperties: {
          summary: { value: "ok" },
          counts: {
            value: {
              type: "object",
              class: "Array",
              preview: {
                items: [1, 2, 3],
              },
            },
          },
          nested: {
            value: {
              type: "object",
              class: "Object",
              preview: {
                ownProperties: {
                  passed: { value: true },
                },
              },
            },
          },
        },
      },
    });

    assert.deepEqual(unwrapped, {
      summary: "ok",
      counts: [1, 2, 3],
      nested: {
        passed: true,
      },
    });
  });

  it("should create script error with category and stage", () => {
    const error = createScriptError("args", "Unknown option: --invalid", {
      failedStage: "parse-args",
    });

    assert.ok(error instanceof Error);
    assert.equal(error.message, "Unknown option: --invalid");
    assert.equal(error.scriptErrorCategory, "args");
    assert.equal(error.failedStage, "parse-args");
  });

  it("should build script failure info with all fields", () => {
    const error = createScriptError("validation", "Config mismatch", {
      failedStage: "validate-config",
    });

    const info = buildScriptFailureInfo(error, { durationMs: 123 });

    assert.equal(info.errorCategory, "validation");
    assert.equal(info.errorCategoryLabel, "验证错误");
    assert.equal(info.errorMessage, "Config mismatch");
    assert.equal(info.failedStage, "validate-config");
    assert.equal(info.durationMs, 123);
  });

  it("should normalize script error category", () => {
    assert.equal(normalizeScriptErrorCategory("ARGS"), "args");
    assert.equal(normalizeScriptErrorCategory("Validation"), "validation");
    assert.equal(normalizeScriptErrorCategory("TIMEOUT"), "timeout");
    assert.equal(normalizeScriptErrorCategory("unknown"), "unknown");
    assert.equal(normalizeScriptErrorCategory("invalid-category"), "unknown");
    assert.equal(normalizeScriptErrorCategory(null), "unknown");
    assert.equal(normalizeScriptErrorCategory(""), "unknown");
  });

  it("should pick script error category label", () => {
    assert.equal(pickScriptErrorCategoryLabel("args"), "参数错误");
    assert.equal(pickScriptErrorCategoryLabel("config"), "配置错误");
    assert.equal(pickScriptErrorCategoryLabel("environment"), "环境错误");
    assert.equal(pickScriptErrorCategoryLabel("execution"), "执行错误");
    assert.equal(pickScriptErrorCategoryLabel("validation"), "验证错误");
    assert.equal(pickScriptErrorCategoryLabel("timeout"), "超时错误");
    assert.equal(pickScriptErrorCategoryLabel("unknown"), "未知错误");
    assert.equal(pickScriptErrorCategoryLabel("invalid"), "未知错误");
  });

  it("should infer error category from error message", () => {
    const timeoutError = buildScriptFailureInfo(
      new Error("Operation timed out after 30s"),
      { durationMs: 30000 },
    );
    assert.equal(timeoutError.errorCategory, "timeout");

    const argsError = buildScriptFailureInfo(
      new Error("Unknown option: --invalid-flag"),
      { durationMs: 10 },
    );
    assert.equal(argsError.errorCategory, "args");

    const envError = buildScriptFailureInfo(
      { code: "ENOENT", message: "ENOENT: no such file" },
      { durationMs: 5 },
    );
    assert.equal(envError.errorCategory, "environment");

    const validationError = buildScriptFailureInfo(
      new Error("Version mismatch: expected 1.0, got 2.0"),
      { durationMs: 8 },
    );
    assert.equal(validationError.errorCategory, "validation");
  });

  it("should have consistent category labels", () => {
    const expectedLabels = {
      args: "参数错误",
      config: "配置错误",
      environment: "环境错误",
      execution: "执行错误",
      validation: "验证错误",
      timeout: "超时错误",
      unknown: "未知错误",
    };

    assert.deepEqual(SCRIPT_ERROR_CATEGORY_LABELS, expectedLabels);
  });
});
