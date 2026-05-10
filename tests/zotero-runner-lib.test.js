/**
 * Zotero runner helper tests
 */
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { describe, it, assert } from "./test-framework.js";
import {
  buildStartupArgs,
  buildUserPrefs,
  connectRdpWithLaunchDiagnostics,
  diffWatchSnapshots,
  findFreePort,
  findManagedRuntimeProcesses,
  formatProcessLogTail,
  getDefaultWatchRoots,
  getRuntimeRoot,
  installProxyAddon,
  parseDotEnv,
  prepareRuntime,
  readAddonRuntimeInfo,
  RdpClient,
  resolveRuntimePaths,
  serializeUserPrefs,
  stopManagedRuntimeProcesses,
  unwrapRdpValue,
} from "../scripts/zotero-runner-lib.mjs";
import {
  assertNonEmptyString,
  assertPlainObject,
  buildScriptFailureInfo,
  createScriptError,
  isExecutedAsScript,
  parseBooleanEnvFlag,
  parseEnumOption,
  parseIntegerOption,
  readJSONFile,
  resolveEnvPath,
  resolvePathOption,
  normalizeScriptErrorCategory,
  pickScriptErrorCategoryLabel,
  SCRIPT_ERROR_CATEGORY_LABELS,
  wrapScriptError,
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

  it("should fall back to default local bind when loopback port probing is denied", async () => {
    const attempts = [];
    const port = await findFreePort({
      hosts: ["127.0.0.1", null],
      createServer: () => {
        const listeners = new Map();
        return {
          on(event, handler) {
            listeners.set(event, handler);
          },
          listen(options, callback) {
            attempts.push(options?.host ?? null);
            if (options?.host === "127.0.0.1") {
              const error = new Error("listen EPERM: operation not permitted 127.0.0.1");
              error.code = "EPERM";
              listeners.get("error")?.(error);
              return;
            }
            callback();
          },
          address() {
            return {
              address: attempts[attempts.length - 1] || "::",
              family: attempts[attempts.length - 1] ? "IPv4" : "IPv6",
              port: 43123,
            };
          },
          close(callback) {
            callback?.();
          },
        };
      },
    });

    assert.equal(port, 43123);
    assert.deepEqual(attempts, ["127.0.0.1", null]);
  });

  it("should keep non-retryable free port probe failures visible", async () => {
    const attempts = [];
    let error = null;

    try {
      await findFreePort({
        hosts: ["127.0.0.1", null],
        createServer: () => {
          const listeners = new Map();
          return {
            on(event, handler) {
              listeners.set(event, handler);
            },
            listen(options) {
              attempts.push(options?.host ?? null);
              const probeError = new Error("listen EADDRINUSE: address already in use 127.0.0.1");
              probeError.code = "EADDRINUSE";
              listeners.get("error")?.(probeError);
            },
            address() {
              return null;
            },
            close(callback) {
              callback?.();
            },
          };
        },
      });
    }
    catch (caught) {
      error = caught;
    }

    assert.ok(error);
    assert.equal(error.code, "EADDRINUSE");
    assert.deepEqual(attempts, ["127.0.0.1"]);
  });

  it("should resolve default runtime paths inside a project-scoped temp runtime", () => {
    const projectRoot = "/tmp/addon-template";
    const resolved = resolveRuntimePaths(projectRoot, "smoke");
    const runtimeRoot = getRuntimeRoot(projectRoot);

    assert.equal(
      resolved.profilePath,
      path.join(runtimeRoot, "smoke", "profile"),
    );
    assert.equal(
      resolved.dataDir,
      path.join(runtimeRoot, "smoke", "data"),
    );
    assert.equal(resolved.dataDir.includes(`${projectRoot}${path.sep}`), false);
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

  it("should allow reading addon runtime info before build output exists when requireBuild is false", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cleanroom-runtime-info-"));
    const configDir = path.join(projectRoot, "config");
    const distDir = path.join(projectRoot, "dist");
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "addon.config.json"), JSON.stringify({
      addonName: "Zotero Cleanroom Template",
      addonId: "cleanroom-template@example.com",
      addonRef: "cleanroomtemplate",
      addonVersion: "0.1.0",
      description: "A clean-room Zotero plugin template with independent architecture.",
      author: "Your Team",
      homepage: "https://github.com/OrlandoZh/AddonTemplate4Z",
      strictMinVersion: "6.999",
      strictMaxVersion: "8.*",
      prefsPrefix: "extensions.zotero.cleanroomtemplate",
      instanceKey: "CleanroomTemplate",
      defaultPrefs: {
        enabled: true,
        logLevel: "info",
      },
    }, null, 2), "utf-8");

    try {
      let missingBuildError = null;
      try {
        await readAddonRuntimeInfo(projectRoot);
      }
      catch (error) {
        missingBuildError = error;
      }

      assert.ok(missingBuildError);
      assert.ok(String(missingBuildError.message || "").includes("Build output not found"));

      const runtimeInfo = await readAddonRuntimeInfo(projectRoot, {
        requireBuild: false,
      });
      assert.equal(runtimeInfo.config.addonRef, "cleanroomtemplate");
      assert.equal(runtimeInfo.buildPath, path.join(projectRoot, "build", "cleanroomtemplate"));
      assert.equal(runtimeInfo.xpiPath, null);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("should sanitize managed runtime markers without resetting directories on non-fresh runs", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cleanroom-runtime-"));
    const profilePath = path.join(projectRoot, ".zotero-runtime", "watch", "profile");
    const dataDir = path.join(projectRoot, ".zotero-runtime", "watch", "data");
    fs.mkdirSync(profilePath, { recursive: true });
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(profilePath, ".parentlock"), "lock", "utf-8");
    fs.writeFileSync(path.join(profilePath, ".startup-incomplete"), "stale", "utf-8");
    fs.writeFileSync(path.join(profilePath, "keep.txt"), "keep", "utf-8");

    try {
      const summary = await prepareRuntime({
        projectRoot,
        profilePath,
        dataDir,
        fresh: false,
      });

      assert.equal(summary.managed, true);
      assert.equal(summary.fresh, false);
      assert.equal(summary.profileReset, false);
      assert.equal(summary.dataReset, false);
      assert.equal(summary.removedMarkers.length, 2);
      assert.notOk(fs.existsSync(path.join(profilePath, ".parentlock")));
      assert.notOk(fs.existsSync(path.join(profilePath, ".startup-incomplete")));
      assert.ok(fs.existsSync(path.join(profilePath, "keep.txt")));
      assert.ok(fs.existsSync(path.join(profilePath, "user.js")));
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("should find matching managed runtime processes for the current profile and project runtime root", () => {
    const projectRoot = "/tmp/addon-template";
    const profilePath = path.join(projectRoot, ".zotero-runtime", "agent", "profile");
    const dataDir = path.join(projectRoot, ".zotero-runtime", "agent", "data");
    const psOutput = [
      `123 /Applications/Zotero.app/Contents/MacOS/zotero --purgecaches -no-remote -profile ${profilePath} --dataDir ${dataDir} -start-debugger-server 5000`,
      `456 /Applications/Zotero.app/Contents/MacOS/zotero --purgecaches -no-remote -profile ${path.join(projectRoot, ".zotero-runtime", "watch", "profile")} --dataDir ${path.join(projectRoot, ".zotero-runtime", "watch", "data")} -start-debugger-server 5001`,
      "789 /Applications/Zotero.app/Contents/MacOS/zotero --purgecaches -profile /tmp/other/profile --dataDir /tmp/other/data -start-debugger-server 5002",
    ].join("\n");

    const matchingOnly = findManagedRuntimeProcesses({
      projectRoot,
      profilePath,
      dataDir,
      psOutput,
      currentPid: 999,
    });
    assert.equal(matchingOnly.length, 1);
    assert.deepEqual(matchingOnly[0].matchReasons, ["profile", "data"]);

    const exclusive = findManagedRuntimeProcesses({
      projectRoot,
      profilePath,
      dataDir,
      includeProjectRuntime: true,
      psOutput,
      currentPid: 999,
    });
    assert.equal(exclusive.length, 2);
    assert.deepEqual(exclusive[0].matchReasons, ["profile", "data", "project-runtime"]);
    assert.deepEqual(exclusive[1].matchReasons, ["project-runtime"]);
  });

  it("should stop managed runtime processes and escalate to SIGKILL when needed", async () => {
    const projectRoot = "/tmp/addon-template";
    const profilePath = path.join(projectRoot, ".zotero-runtime", "agent", "profile");
    const dataDir = path.join(projectRoot, ".zotero-runtime", "agent", "data");
    const processStates = new Map([
      [123, { pid: 123, command: `zotero -profile ${profilePath} --dataDir ${dataDir}`, matchReasons: ["profile", "data"] }],
      [456, { pid: 456, command: `zotero -profile ${path.join(projectRoot, ".zotero-runtime", "watch", "profile")} --dataDir ${path.join(projectRoot, ".zotero-runtime", "watch", "data")}`, matchReasons: ["project-runtime"] }],
    ]);
    const signals = [];

    const summary = await stopManagedRuntimeProcesses({
      projectRoot,
      profilePath,
      dataDir,
      includeProjectRuntime: true,
      findProcesses: () => Array.from(processStates.values()),
      killProcess: (pid, signal) => {
        signals.push(`${pid}:${signal}`);
        if (pid === 123) {
          processStates.delete(pid);
          return;
        }
        if (pid === 456 && signal === "SIGKILL") {
          processStates.delete(pid);
        }
      },
      pollIntervalMs: 0,
      termTimeoutMs: 0,
      killTimeoutMs: 0,
      sleep: async () => {},
    });

    assert.deepEqual(signals, [
      "123:SIGTERM",
      "456:SIGTERM",
      "456:SIGKILL",
    ]);
    assert.equal(summary.observedProcesses.length, 2);
    assert.equal(summary.remainingProcesses.length, 0);
    assert.equal(summary.terminatedProcesses.length, 2);
    assert.equal(summary.terminatedProcesses.find((entry) => entry.pid === 123)?.forced, false);
    assert.equal(summary.terminatedProcesses.find((entry) => entry.pid === 456)?.forced, true);
  });

  it("should request exclusive project runtime cleanup for agent prepareRuntime runs", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cleanroom-runtime-"));
    const profilePath = path.join(projectRoot, ".zotero-runtime", "agent", "profile");
    const dataDir = path.join(projectRoot, ".zotero-runtime", "agent", "data");
    let receivedOptions = null;

    try {
      const summary = await prepareRuntime({
        projectRoot,
        profilePath,
        dataDir,
        fresh: false,
        exclusiveProjectRuntime: true,
        stopManagedRuntimeProcessesImpl: async (options) => {
          receivedOptions = options;
          return {
            observedProcesses: [
              {
                pid: 321,
                command: `zotero -profile ${path.join(projectRoot, ".zotero-runtime", "watch", "profile")}`,
                matchReasons: ["project-runtime"],
              },
            ],
            terminatedProcesses: [
              {
                pid: 321,
                command: `zotero -profile ${path.join(projectRoot, ".zotero-runtime", "watch", "profile")}`,
                matchReasons: ["project-runtime"],
                forced: false,
                signalsSent: ["SIGTERM"],
              },
            ],
            remainingProcesses: [],
            terminationErrors: [],
          };
        },
      });

      assert.equal(receivedOptions.includeProjectRuntime, true);
      assert.equal(summary.exclusiveProjectRuntime, true);
      assert.equal(summary.terminatedProcesses.length, 1);
      assert.equal(summary.terminatedProcesses[0].pid, 321);
      assert.equal(summary.remainingProcesses.length, 0);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("should not sanitize unmanaged profile markers", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cleanroom-runtime-root-"));
    const profilePath = fs.mkdtempSync(path.join(os.tmpdir(), "cleanroom-runtime-external-profile-"));
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cleanroom-runtime-external-data-"));
    fs.writeFileSync(path.join(profilePath, ".parentlock"), "lock", "utf-8");
    fs.writeFileSync(path.join(profilePath, ".startup-incomplete"), "stale", "utf-8");

    try {
      const summary = await prepareRuntime({
        projectRoot,
        profilePath,
        dataDir,
        fresh: false,
      });

      assert.equal(summary.managed, false);
      assert.equal(summary.removedMarkers.length, 0);
      assert.ok(fs.existsSync(path.join(profilePath, ".parentlock")));
      assert.ok(fs.existsSync(path.join(profilePath, ".startup-incomplete")));
      assert.ok(fs.existsSync(path.join(profilePath, "user.js")));
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
      fs.rmSync(profilePath, { recursive: true, force: true });
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("should classify child exit before RDP becomes reachable", async () => {
    class FakeRdpClient {
      async connect() {
        const error = new Error("connect ECONNREFUSED 127.0.0.1:4000");
        error.code = "ECONNREFUSED";
        throw error;
      }

      disconnect() {}
    }

    const child = new EventEmitter();
    child.exitCode = null;
    const processLogs = [
      { at: "2026-03-29T00:00:00.000Z", source: "zotero.stderr", level: "stderr", message: "startup begin" },
      { at: "2026-03-29T00:00:01.000Z", source: "zotero.stderr", level: "stderr", message: "crashed" },
    ];

    let error = null;
    const pending = connectRdpWithLaunchDiagnostics({
      child,
      rdpPort: 4000,
      processLogs,
      retries: 3,
      retryDelayMs: 1,
      createClient: () => new FakeRdpClient(),
    });
    setTimeout(() => {
      child.exitCode = 11;
      child.emit("exit", 11, "SIGSEGV");
    }, 0);

    try {
      await pending;
    } catch (caught) {
      error = caught;
    }

    assert.ok(error);
    assert.equal(error.launchFailure?.kind, "child-exit-before-rdp");
    assert.equal(error.launchFailure?.childExit?.code, 11);
    assert.equal(error.launchFailure?.childExit?.signal, "SIGSEGV");
    assert.equal(error.launchFailure?.attemptCount, 1);
    assert.equal(error.launchFailure?.processLogTail?.length, 2);
  });

  it("should classify repeated retryable RDP failures as timeout", async () => {
    const attempts = [];
    class FakeRdpClient {
      async connect() {
        attempts.push(Date.now());
        const error = new Error("connect ECONNREFUSED 127.0.0.1:4555");
        error.code = "ECONNREFUSED";
        throw error;
      }

      disconnect() {}
    }

    const child = new EventEmitter();
    child.exitCode = null;
    let error = null;
    try {
      await connectRdpWithLaunchDiagnostics({
        child,
        rdpPort: 4555,
        processLogs: [{ at: "2026-03-29T00:00:00.000Z", source: "zotero.stdout", level: "stdout", message: "wait" }],
        retries: 3,
        retryDelayMs: 1,
        createClient: () => new FakeRdpClient(),
      });
    } catch (caught) {
      error = caught;
    }

    assert.ok(error);
    assert.equal(error.launchFailure?.kind, "rdp-connect-timeout");
    assert.equal(error.launchFailure?.attemptCount, 3);
    assert.equal(error.launchFailure?.lastConnectError?.code, "ECONNREFUSED");
    assert.equal(attempts.length, 3);
  });

  it("should keep process log tails in a compact normalized shape", () => {
    const tail = formatProcessLogTail([
      "raw message",
      { at: "2026-03-29T00:00:00.000Z", source: "zotero.stdout", level: "stdout", message: "ready" },
    ], 2);

    assert.deepEqual(tail, [
      {
        at: null,
        source: "unknown",
        level: "info",
        message: "raw message",
      },
      {
        at: "2026-03-29T00:00:00.000Z",
        source: "zotero.stdout",
        level: "stdout",
        message: "ready",
      },
    ]);
  });

  it("should include label and actor metadata on waitForEvent timeouts", async () => {
    const client = new RdpClient();
    let error = null;

    try {
      await client.waitForEvent(() => false, {
        timeoutMs: 1,
        label: "scenario:reader surface smoke",
        phase: "evaluateInChrome",
        consoleActor: "server.conn.console",
        resultID: "result-1",
      });
    }
    catch (caught) {
      error = caught;
    }

    assert.ok(error);
    assert.equal(error.scriptErrorCategory, "timeout");
    assert.equal(error.failedStage, "chrome-evaluation");
    assert.equal(error.details?.kind, "chrome-evaluation-timeout");
    assert.equal(error.details?.label, "scenario:reader surface smoke");
    assert.equal(error.details?.phase, "evaluateInChrome");
    assert.equal(error.details?.consoleActor, "server.conn.console");
    assert.equal(error.details?.resultID, "result-1");
  });

  it("should surface structured chrome evaluation timeout details", async () => {
    const client = new RdpClient();
    client.getParentProcessTarget = async () => ({
      consoleActor: "server.conn.console",
    });
    client.request = async (payload) => {
      if (payload?.type === "evaluateJSAsync") {
        return { resultID: "result-42" };
      }
      return {};
    };

    let error = null;
    try {
      await client.evaluateInChrome("(() => 1)()", {
        label: "scenario:menu surface smoke",
        timeoutMs: 1,
      });
    }
    catch (caught) {
      error = caught;
    }

    assert.ok(error);
    assert.equal(error.scriptErrorCategory, "timeout");
    assert.equal(error.failedStage, "chrome-evaluation");
    assert.equal(error.details?.kind, "chrome-evaluation-timeout");
    assert.equal(error.details?.label, "scenario:menu surface smoke");
    assert.equal(error.details?.consoleActor, "server.conn.console");
    assert.equal(error.details?.resultID, "result-42");
  });

  it("should reject pending requests when the RDP socket closes cleanly", async () => {
    const server = net.createServer((socket) => {
      const greeting = JSON.stringify({ from: "root" });
      socket.write(`${Buffer.byteLength(greeting)}:${greeting}`);
      socket.once("data", () => {
        socket.end();
      });
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : null;
    const client = new RdpClient();
    let error = null;

    try {
      await client.connect({
        port,
        retries: 1,
        retryDelayMs: 1,
      });

      try {
        await Promise.race([
          client.request("getRoot"),
          new Promise((_, reject) => setTimeout(() => reject(new Error("request-timeout")), 200)),
        ]);
      }
      catch (caught) {
        error = caught;
      }
    } finally {
      client.disconnect();
      await new Promise((resolve) => server.close(resolve));
    }

    assert.ok(error);
    assert.equal(error.message === "request-timeout", false);
    assert.match(error.message, /RDP socket (ended|closed|disconnected)/u);
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
      details: {
        file: "config/addon.config.json",
      },
    });

    const info = buildScriptFailureInfo(error, { durationMs: 123 });

    assert.equal(info.errorCategory, "validation");
    assert.equal(info.errorCategoryLabel, "验证错误");
    assert.equal(info.errorMessage, "Config mismatch");
    assert.equal(info.failedStage, "validate-config");
    assert.equal(info.durationMs, 123);
    assert.deepEqual(info.details, {
      file: "config/addon.config.json",
    });
  });

  it("should wrap script errors with stable stage and merged details", () => {
    const original = createScriptError("validation", "Config mismatch", {
      failedStage: "read-config",
      details: {
        file: "config/addon.config.json",
      },
    });

    const wrapped = wrapScriptError(original, {
      category: "config",
      failedStage: "validate-config",
      details: {
        reason: "missing-addon-id",
      },
    });

    const info = buildScriptFailureInfo(wrapped, { durationMs: 88 });
    assert.equal(info.errorCategory, "config");
    assert.equal(info.failedStage, "validate-config");
    assert.deepEqual(info.details, {
      file: "config/addon.config.json",
      reason: "missing-addon-id",
    });
  });

  it("should parse shared script runtime options safely", () => {
    assert.equal(parseIntegerOption("3", { name: "cycles", min: 1, max: 10 }), 3);
    assert.equal(parseEnumOption("hot", { name: "strategy", allowed: ["hot", "restart"] }), "hot");
    assert.equal(
      resolvePathOption("./dist/report.json", { name: "report", baseDir: "/tmp/project" }),
      path.resolve("/tmp/project", "./dist/report.json"),
    );
    assert.equal(parseBooleanEnvFlag({ ENABLED: "yes" }, "ENABLED"), true);
    assert.equal(resolveEnvPath({ AGENT_DIR: "./obsidian" }, "AGENT_DIR"), path.resolve("./obsidian"));
  });

  it("should throw structured errors for invalid shared runtime options", () => {
    let cyclesError = null;
    try {
      parseIntegerOption("0", { name: "cycles", min: 1 });
    } catch (error) {
      cyclesError = error;
    }
    assert.equal(cyclesError?.scriptErrorCategory, "args");
    assert.equal(cyclesError?.details?.option, "cycles");

    let strategyError = null;
    try {
      parseEnumOption("warm", { name: "strategy", allowed: ["hot", "restart"] });
    } catch (error) {
      strategyError = error;
    }
    assert.equal(strategyError?.scriptErrorCategory, "args");
    assert.equal(strategyError?.details?.allowed?.length, 2);

    let envError = null;
    try {
      parseBooleanEnvFlag({ AGENT_OBSIDIAN_VISUALS: "maybe" }, "AGENT_OBSIDIAN_VISUALS");
    } catch (error) {
      envError = error;
    }
    assert.equal(envError?.scriptErrorCategory, "environment");
    assert.equal(envError?.details?.envVar, "AGENT_OBSIDIAN_VISUALS");
  });

  it("should validate shared config helper inputs", () => {
    assert.equal(assertNonEmptyString(" cleanroomtemplate ", "addonRef"), "cleanroomtemplate");
    assert.deepEqual(assertPlainObject({ addonId: "cleanroom-template@example.com" }, "config"), {
      addonId: "cleanroom-template@example.com",
    });

    let emptyStringError = null;
    try {
      assertNonEmptyString("", "addonRef", { failedStage: "validate-config" });
    } catch (error) {
      emptyStringError = error;
    }
    assert.equal(emptyStringError?.scriptErrorCategory, "validation");
    assert.equal(emptyStringError?.failedStage, "validate-config");

    let plainObjectError = null;
    try {
      assertPlainObject(null, "config", { category: "config", failedStage: "validate-config" });
    } catch (error) {
      plainObjectError = error;
    }
    assert.equal(plainObjectError?.scriptErrorCategory, "config");
    assert.equal(plainObjectError?.failedStage, "validate-config");
  });

  it("should read json files with structured missing and invalid errors", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cleanroom-script-runtime-"));
    const validPath = path.join(tempDir, "valid.json");
    const invalidPath = path.join(tempDir, "invalid.json");
    const missingPath = path.join(tempDir, "missing.json");
    fs.writeFileSync(validPath, JSON.stringify({ ok: true }), "utf-8");
    fs.writeFileSync(invalidPath, "{ invalid json", "utf-8");

    try {
      const parsed = await readJSONFile(validPath, {
        failedStage: "read-config",
        label: "valid config",
      });
      assert.deepEqual(parsed, { ok: true });

      let invalidError = null;
      try {
        await readJSONFile(invalidPath, { failedStage: "read-config", label: "invalid config" });
      } catch (error) {
        invalidError = error;
      }
      assert.equal(invalidError?.scriptErrorCategory, "validation");
      assert.equal(invalidError?.failedStage, "read-config");

      let missingError = null;
      try {
        await readJSONFile(missingPath, { failedStage: "read-config", label: "missing config" });
      } catch (error) {
        missingError = error;
      }
      assert.equal(missingError?.scriptErrorCategory, "environment");
      assert.equal(missingError?.failedStage, "read-config");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should detect whether the current module is executed as a script", () => {
    assert.equal(
      isExecutedAsScript("file:///tmp/scripts/demo.mjs", ["node", "/tmp/scripts/demo.mjs"]),
      true,
    );
    assert.equal(
      isExecutedAsScript("file:///tmp/scripts/demo.mjs", ["node", "/tmp/scripts/other.mjs"]),
      false,
    );
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
