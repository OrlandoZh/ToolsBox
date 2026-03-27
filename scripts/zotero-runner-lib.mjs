import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import net from "node:net";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { acquireBuildLock } from "./build-lock.mjs";

const DEFAULT_ENV_FILES = [".env", ".env.local"];

const DEFAULT_PREFS = {
  "browser.dom.window.dump.enabled": true,
  "devtools.browserconsole.contentMessages": true,
  "devtools.chrome.enabled": true,
  "devtools.debugger.prompt-connection": false,
  "devtools.debugger.remote-enabled": true,
  "devtools.debugger.remote-websocket": true,
  "extensions.autoDisableScopes": 0,
  "extensions.experiments.enabled": true,
  "extensions.zotero.firstRun.skipFirefoxProfileAccessCheck": true,
  "extensions.zotero.firstRunGuidance": false,
  "extensions.zotero.firstRun2": false,
  "extensions.zotero.httpServer.enabled": true,
  "extensions.zotero.httpServer.localAPI.enabled": true,
  "extensions.zotero.httpServer.port": 23124,
  "xpinstall.signatures.required": false,
};

const DEFAULT_WATCH_ROOTS = [
  "src",
  "addon-static",
  "config",
];

const DEFAULT_BINARY_CANDIDATES = [
  "/Applications/Zotero.app/Contents/MacOS/zotero",
  "/Applications/Zotero Beta.app/Contents/MacOS/zotero",
  path.join(process.env.LOCALAPPDATA || "", "Zotero", "zotero.exe"),
  path.join(process.env.PROGRAMFILES || "", "Zotero", "zotero.exe"),
  path.join(process.env.PROGRAMFILES || "", "Zotero", "zotero-beta.exe"),
  "/usr/lib/zotero/zotero",
  "/snap/bin/zotero",
].filter(Boolean);

export function parseDotEnv(content) {
  const values = {};

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const normalized = line.startsWith("export ")
      ? line.slice("export ".length).trim()
      : line;
    const separatorIndex = normalized.indexOf("=");
    if (separatorIndex < 1) {
      continue;
    }

    const key = normalized.slice(0, separatorIndex).trim();
    let value = normalized.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

async function loadEnvFiles(projectRoot, fileNames = DEFAULT_ENV_FILES) {
  const merged = {};

  for (const fileName of fileNames) {
    const filePath = path.join(projectRoot, fileName);
    try {
      const content = await fsp.readFile(filePath, "utf-8");
      Object.assign(merged, parseDotEnv(content));
    }
    catch (error) {
      if (error && error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  return merged;
}

function normalizePort(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const port = Number.parseInt(String(value), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}

function escapePrefString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function serializeUserPrefs(prefs) {
  return Object.entries(prefs)
    .map(([key, value]) => {
      if (typeof value === "string") {
        return `user_pref("${key}", "${escapePrefString(value)}");`;
      }
      return `user_pref("${key}", ${String(value)});`;
    })
    .join("\n") + "\n";
}

export function buildUserPrefs(overrides = {}) {
  return {
    ...DEFAULT_PREFS,
    ...overrides,
  };
}

export function getRuntimeRoot(projectRoot) {
  return path.join(projectRoot, ".zotero-runtime");
}

export function getDefaultWatchRoots() {
  return [...DEFAULT_WATCH_ROOTS];
}

export function toFileHref(filePath) {
  return pathToFileURL(path.resolve(filePath)).href;
}

export function unwrapRdpValue(result) {
  if (Array.isArray(result)) {
    return result.map((item) => unwrapRdpValue(item));
  }

  if (!result || typeof result !== "object") {
    return result;
  }

  if (result.type === "null") {
    return null;
  }
  if (result.type === "undefined") {
    return undefined;
  }
  if (result.type === "NaN") {
    return Number.NaN;
  }
  if (result.type === "Infinity") {
    return Number.POSITIVE_INFINITY;
  }
  if (result.type === "-Infinity") {
    return Number.NEGATIVE_INFINITY;
  }
  if (result.type === "-0") {
    return -0;
  }
  if (result.type === "longString") {
    return result.initial || "";
  }

  if (result.preview) {
    if (Array.isArray(result.preview.items)) {
      return result.preview.items.map((item) => unwrapRdpValue(item?.value ?? item));
    }

    const objectValue = {};
    let hasProperties = false;

    if (result.preview.ownProperties) {
      hasProperties = true;
      for (const [key, descriptor] of Object.entries(result.preview.ownProperties)) {
        if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, "value")) {
          objectValue[key] = unwrapRdpValue(descriptor.value);
        }
        else if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, "getterValue")) {
          objectValue[key] = unwrapRdpValue(descriptor.getterValue);
        }
      }
    }

    if (result.preview.safeGetterValues) {
      hasProperties = true;
      for (const [key, descriptor] of Object.entries(result.preview.safeGetterValues)) {
        if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, "getterValue")) {
          objectValue[key] = unwrapRdpValue(descriptor.getterValue);
        }
        else if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, "value")) {
          objectValue[key] = unwrapRdpValue(descriptor.value);
        }
      }
    }

    if (hasProperties) {
      return objectValue;
    }
  }

  return result;
}

export function resolveRuntimePaths(projectRoot, mode, env = {}) {
  const runtimeRoot = getRuntimeRoot(projectRoot);
  const baseDir = path.join(runtimeRoot, mode);

  return {
    runtimeRoot,
    profilePath: path.resolve(env.ZOTERO_PLUGIN_PROFILE_PATH || path.join(baseDir, "profile")),
    dataDir: path.resolve(env.ZOTERO_PLUGIN_DATA_DIR || path.join(baseDir, "data")),
  };
}

function isManagedPath(projectRoot, targetPath) {
  const runtimeRoot = path.resolve(getRuntimeRoot(projectRoot));
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget === runtimeRoot || resolvedTarget.startsWith(`${runtimeRoot}${path.sep}`);
}

export async function prepareRuntime({
  projectRoot,
  profilePath,
  dataDir,
  fresh = false,
  userPrefs = {},
}) {
  if (fresh && isManagedPath(projectRoot, profilePath)) {
    await fsp.rm(profilePath, { recursive: true, force: true });
  }
  if (fresh && isManagedPath(projectRoot, dataDir)) {
    await fsp.rm(dataDir, { recursive: true, force: true });
  }

  await fsp.mkdir(profilePath, { recursive: true });
  await fsp.mkdir(dataDir, { recursive: true });

  const prefsContent = serializeUserPrefs(buildUserPrefs(userPrefs));
  await fsp.writeFile(path.join(profilePath, "user.js"), prefsContent, "utf-8");
}

export async function installProxyAddon({
  profilePath,
  addonId,
  addonPath,
}) {
  const extensionsDir = path.join(profilePath, "extensions");
  await fsp.mkdir(extensionsDir, { recursive: true });
  await fsp.writeFile(
    path.join(extensionsDir, addonId),
    `${path.resolve(addonPath)}\n`,
    "utf-8",
  );
  await fsp.rm(path.join(extensionsDir, `${addonId}.xpi`), { force: true });
}

export async function findDefaultZoteroBinary(candidates = DEFAULT_BINARY_CANDIDATES) {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return path.resolve(candidate);
    }
  }
  return null;
}

export async function readRunnerConfig({ projectRoot, mode, env = process.env }) {
  const fileEnv = await loadEnvFiles(projectRoot);
  const mergedEnv = {
    ...fileEnv,
    ...env,
  };
  const { profilePath, dataDir } = resolveRuntimePaths(projectRoot, mode, mergedEnv);
  const binaryPath = mergedEnv.ZOTERO_PLUGIN_ZOTERO_BIN_PATH
    ? path.resolve(mergedEnv.ZOTERO_PLUGIN_ZOTERO_BIN_PATH)
    : await findDefaultZoteroBinary();

  if (!binaryPath) {
    throw new Error(
      "Unable to find Zotero binary. Set ZOTERO_PLUGIN_ZOTERO_BIN_PATH in .env.local or environment variables.",
    );
  }

  return {
    binaryPath,
    profilePath,
    dataDir,
    rdpPort: normalizePort(mergedEnv.ZOTERO_PLUGIN_RDP_PORT),
    watchIntervalMs: normalizePort(mergedEnv.ZOTERO_PLUGIN_WATCH_INTERVAL_MS) || 1000,
  };
}

export function buildStartupArgs({
  profilePath,
  dataDir,
  rdpPort,
  devtools = false,
  startArgs = [],
}) {
  const args = [
    "--purgecaches",
    "-no-remote",
    "-profile",
    profilePath,
    "--dataDir",
    dataDir,
    "-start-debugger-server",
    String(rdpPort),
  ];

  if (devtools) {
    args.push("--jsdebugger");
  }

  return [...args, ...startArgs];
}

export async function findFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Unable to determine free port")));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

export function packageAddon(projectRoot, options = {}) {
  execFileSync(process.execPath, ["scripts/package.mjs"], {
    cwd: projectRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      ...(options.env || {}),
    },
  });
}

export function buildAddon(projectRoot, options = {}) {
  execFileSync(process.execPath, ["scripts/build.mjs"], {
    cwd: projectRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      ...(options.env || {}),
    },
  });
}

export async function readAddonRuntimeInfo(projectRoot) {
  const configPath = path.join(projectRoot, "config", "addon.config.json");
  const config = JSON.parse(await fsp.readFile(configPath, "utf-8"));
  const buildPath = path.join(projectRoot, "build", config.addonRef);
  const xpiPath = path.join(
    projectRoot,
    "dist",
    `${config.addonRef}-${config.addonVersion}.xpi`,
  );

  if (!fs.existsSync(buildPath)) {
    throw new Error(`Build output not found: ${buildPath}`);
  }

  return {
    config,
    buildPath,
    xpiPath: fs.existsSync(xpiPath) ? xpiPath : null,
  };
}

export class RdpClient {
  constructor() {
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.pending = new Map();
    this.eventQueue = [];
    this.eventWaiters = [];
    this.greeting = null;
  }

  async connect({
    port,
    host = "127.0.0.1",
    retries = 60,
    retryDelayMs = 500,
  }) {
    let lastError = null;

    for (let attempt = 0; attempt < retries; attempt += 1) {
      try {
        await this.#open(port, host);
        return;
      }
      catch (error) {
        lastError = error;
        const retryable = error && (
          error.code === "ECONNREFUSED"
          || error.code === "ECONNRESET"
          || error.code === "EPIPE"
        );
        if (!retryable || attempt === retries - 1) {
          throw lastError;
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }

    throw lastError || new Error("Unable to connect to Zotero RDP server");
  }

  async #open(port, host) {
    this.disconnect();

    this.socket = net.createConnection({ port, host });
    this.buffer = Buffer.alloc(0);
    this.pending = new Map();
    this.eventQueue = [];
    this.eventWaiters = [];

    this.socket.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.#parseMessages();
    });

    this.socket.on("error", (error) => {
      if (this.greeting) {
        this.greeting.reject(error);
        this.greeting = null;
      }
      for (const deferred of this.pending.values()) {
        deferred.reject(error);
      }
      this.pending.clear();
      for (const waiter of this.eventWaiters) {
        waiter.reject(error);
      }
      this.eventWaiters = [];
    });

    await new Promise((resolve, reject) => {
      this.socket.once("connect", resolve);
      this.socket.once("error", reject);
    });

    await new Promise((resolve, reject) => {
      this.greeting = { resolve, reject };
    });
  }

  disconnect() {
    if (!this.socket) {
      return;
    }

    this.socket.removeAllListeners();
    this.socket.end();
    this.socket.destroy();
    this.socket = null;
    this.greeting = null;
    this.pending.clear();
    this.eventQueue = [];
    for (const waiter of this.eventWaiters) {
      waiter.reject(new Error("RDP socket disconnected"));
    }
    this.eventWaiters = [];
    this.buffer = Buffer.alloc(0);
  }

  #parseMessages() {
    while (true) {
      const separatorIndex = this.buffer.indexOf(":");
      if (separatorIndex < 0) {
        return;
      }

      const sizeToken = this.buffer.slice(0, separatorIndex).toString();
      const bodyLength = Number.parseInt(sizeToken, 10);
      if (!Number.isInteger(bodyLength)) {
        throw new Error(`Invalid RDP frame length: ${sizeToken}`);
      }

      const frameStart = separatorIndex + 1;
      const frameEnd = frameStart + bodyLength;
      if (this.buffer.length < frameEnd) {
        return;
      }

      const payload = this.buffer.slice(frameStart, frameEnd).toString();
      this.buffer = this.buffer.slice(frameEnd);
      this.#handleMessage(JSON.parse(payload));
    }
  }

  #handleMessage(message) {
    if (this.greeting && message.from === "root") {
      this.greeting.resolve(message);
      this.greeting = null;
      return;
    }

    if (message.type === "addonListChanged") {
      return;
    }

    if (message.type) {
      this.#enqueueEvent(message);
      return;
    }

    if (message.from && this.pending.has(message.from)) {
      const deferred = this.pending.get(message.from);
      this.pending.delete(message.from);
      if (message.error) {
        deferred.reject(message);
      }
      else {
        deferred.resolve(message);
      }
    }
  }

  #enqueueEvent(message) {
    const waiterIndex = this.eventWaiters.findIndex(
      (waiter) => waiter.predicate(message),
    );
    if (waiterIndex >= 0) {
      const [waiter] = this.eventWaiters.splice(waiterIndex, 1);
      waiter.resolve(message);
      return;
    }

    this.eventQueue.push(message);
  }

  waitForEvent(predicate, {
    timeoutMs = 5000,
  } = {}) {
    const queuedIndex = this.eventQueue.findIndex((message) => predicate(message));
    if (queuedIndex >= 0) {
      const [message] = this.eventQueue.splice(queuedIndex, 1);
      return Promise.resolve(message);
    }

    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve(message) {
          clearTimeout(timer);
          resolve(message);
        },
        reject(error) {
          clearTimeout(timer);
          reject(error);
        },
      };

      const timer = setTimeout(() => {
        const index = this.eventWaiters.indexOf(waiter);
        if (index >= 0) {
          this.eventWaiters.splice(index, 1);
        }
        reject(new Error("Timed out waiting for RDP event"));
      }, timeoutMs);

      this.eventWaiters.push(waiter);
    });
  }

  async request(payload) {
    if (!this.socket) {
      throw new Error("RDP socket is not connected");
    }

    const message = typeof payload === "string"
      ? { to: "root", type: payload }
      : payload;
    const target = message.to;

    if (!target) {
      throw new Error("RDP requests must include a target actor");
    }
    if (this.pending.has(target)) {
      throw new Error(`Actor already has a pending request: ${target}`);
    }

    return await new Promise((resolve, reject) => {
      this.pending.set(target, { resolve, reject });
      const serialized = JSON.stringify(message);
      this.socket.write(`${Buffer.byteLength(serialized)}:${serialized}`);
    });
  }

  async getRoot() {
    return await this.request("getRoot");
  }

  async getAddonsActor() {
    const root = await this.getRoot();
    if (!root.addonsActor) {
      throw new Error("Zotero RDP root does not expose addonsActor");
    }
    return root.addonsActor;
  }

  async getParentProcessTarget() {
    const processes = await this.request("listProcesses");
    if (!processes.processes || processes.processes.length === 0) {
      throw new Error("Zotero RDP did not return any processes");
    }

    const descriptorActor = processes.processes[0].actor;
    const targetResponse = await this.request({
      to: descriptorActor,
      type: "getTarget",
    });

    if (!targetResponse.process) {
      throw new Error("Zotero RDP did not return a parent process target");
    }

    return targetResponse.process;
  }

  async installTemporaryAddon(addonPath) {
    const addonsActor = await this.getAddonsActor();
    return await this.request({
      to: addonsActor,
      type: "installTemporaryAddon",
      addonPath,
    });
  }

  async installAddonFromFile(addonPath) {
    const response = await this.evaluateInChrome(`(async () => {
      const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
      const file = Components.classes["@mozilla.org/file/local;1"]
        .createInstance(Components.interfaces.nsIFile);
      file.initWithPath(${JSON.stringify(addonPath)});

      const install = await AddonManager.getInstallForFile(file);
      return await new Promise((resolve) => {
        let finished = false;
        const finish = (payload) => {
          if (finished) {
            return;
          }
          finished = true;
          try {
            install.removeListener(listener);
          }
          catch {}
          resolve(JSON.stringify(payload));
        };
        const listener = {
          onInstallEnded(currentInstall, addon) {
            finish({
              ok: true,
              state: "installed",
              addonId: addon?.id || currentInstall?.addon?.id || null,
              version: addon?.version || currentInstall?.addon?.version || null,
            });
          },
          onInstallFailed(currentInstall) {
            finish({
              ok: false,
              state: "install-failed",
              addonId: currentInstall?.addon?.id || null,
              error: currentInstall?.error || null,
            });
          },
          onDownloadFailed(currentInstall) {
            finish({
              ok: false,
              state: "download-failed",
              addonId: currentInstall?.addon?.id || null,
              error: currentInstall?.error || null,
            });
          },
          onOperationCancelled(currentInstall) {
            finish({
              ok: false,
              state: "cancelled",
              addonId: currentInstall?.addon?.id || null,
            });
          },
        };

        install.addListener(listener);
        try {
          install.install();
        }
        catch (error) {
          finish({
            ok: false,
            state: "threw",
            error: error?.message || String(error),
          });
        }
      });
    })()`);

    return typeof response === "string" ? JSON.parse(response) : response;
  }

  async listAddons() {
    return await this.request("listAddons");
  }

  async getAddonById(addonId) {
    const response = await this.listAddons();
    return response.addons.find((addon) => addon.id === addonId) || null;
  }

  async enableAddonById(addonId) {
    const response = await this.evaluateInChrome(`(async () => {
      const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
      const addon = await AddonManager.getAddonByID(${JSON.stringify(addonId)});
      if (!addon) {
        return JSON.stringify({ found: false });
      }
      if (addon.userDisabled && typeof addon.enable === "function") {
        await addon.enable();
      }
      return JSON.stringify({
        found: true,
        isActive: addon.isActive,
        userDisabled: addon.userDisabled,
      });
    })()`);

    return JSON.parse(response);
  }

  async initializeZoteroPlugins() {
    const initialized = await this.evaluateInChrome(`(async () => {
      if (!Zotero?.Plugins || typeof Zotero.Plugins.init !== "function") {
        return false;
      }

      await Zotero.Plugins.init();
      return true;
    })()`);

    return {
      available: initialized === true,
      initialized: initialized === true,
    };
  }

  async bootstrapAddonRuntime({
    addonId,
    addonRef,
    instanceKey,
  }) {
    const response = await this.evaluateInChrome(`(async () => {
      const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
      const addon = await AddonManager.getAddonByID(${JSON.stringify(addonId)});
      if (!addon) {
        return JSON.stringify({ found: false });
      }

      const rootURI = addon.getResourceURI("").spec;
      const registry = globalThis.__CLEANROOM_TEMPLATE_DEV_BOOTSTRAP__
        || (globalThis.__CLEANROOM_TEMPLATE_DEV_BOOTSTRAP__ = {});

      if (Zotero[${JSON.stringify(instanceKey)}]) {
        return JSON.stringify({
          found: true,
          started: true,
          reused: true,
          rootURI,
        });
      }

      const existing = registry[${JSON.stringify(addonId)}];
      if (existing?.handle && typeof existing.handle.destruct === "function") {
        try {
          existing.handle.destruct();
        }
        catch (error) {
          // Ignore stale chrome handles before re-registering.
        }
      }

      const aomStartup = Components.classes[
        "@mozilla.org/addons/addon-manager-startup;1"
      ].getService(Components.interfaces.amIAddonManagerStartup);
      const manifestURI = Services.io.newURI(rootURI + "manifest.json");
      const handle = aomStartup.registerChrome(manifestURI, [
        ["content", ${JSON.stringify(addonRef)}, rootURI + "content/"],
      ]);

      const scope = {
        rootURI,
        Zotero,
        Services,
        ChromeUtils,
        console,
      };
      scope.__CLEANROOM_TEMPLATE_RUNTIME__ = { rootURI };
      globalThis.__CLEANROOM_TEMPLATE_RUNTIME__ = scope.__CLEANROOM_TEMPLATE_RUNTIME__;

      Services.scriptloader.loadSubScript(
        rootURI + "content/scripts/${addonRef}.js",
        scope,
      );

      if (scope.__CLEANROOM_TEMPLATE_CONFIG__) {
        globalThis.__CLEANROOM_TEMPLATE_CONFIG__ = scope.__CLEANROOM_TEMPLATE_CONFIG__;
      }

      if (typeof scope.bootstrapPlugin !== "function") {
        return JSON.stringify({
          found: true,
          started: false,
          reason: "missing-bootstrap-plugin",
          rootURI,
        });
      }

      await scope.bootstrapPlugin();
      registry[${JSON.stringify(addonId)}] = {
        handle,
        rootURI,
        instanceKey: ${JSON.stringify(instanceKey)},
      };

      return JSON.stringify({
        found: true,
        started: Boolean(Zotero[${JSON.stringify(instanceKey)}]),
        rootURI,
        manual: true,
      });
    })()`);

    return JSON.parse(response);
  }

  async restartAddonRuntime({
    addonId,
    addonRef,
    instanceKey,
  }) {
    await this.evaluateInChrome(`(async () => {
      const registry = globalThis.__CLEANROOM_TEMPLATE_DEV_BOOTSTRAP__
        || (globalThis.__CLEANROOM_TEMPLATE_DEV_BOOTSTRAP__ = {});
      const existing = registry[${JSON.stringify(addonId)}];

      if (
        Zotero[${JSON.stringify(instanceKey)}]
        && typeof Zotero[${JSON.stringify(instanceKey)}].shutdown === "function"
      ) {
        await Zotero[${JSON.stringify(instanceKey)}].shutdown();
      }

      delete Zotero[${JSON.stringify(instanceKey)}];
      delete globalThis.__CLEANROOM_TEMPLATE_RUNTIME__;
      delete globalThis.__CLEANROOM_TEMPLATE_CONFIG__;

      if (existing?.handle && typeof existing.handle.destruct === "function") {
        existing.handle.destruct();
      }

      delete registry[${JSON.stringify(addonId)}];
      return true;
    })()`);

    return await this.bootstrapAddonRuntime({
      addonId,
      addonRef,
      instanceKey,
    });
  }

  async reloadAddonById(addonId) {
    const addon = await this.getAddonById(addonId);
    if (!addon) {
      throw new Error(`Unable to find add-on for reload: ${addonId}`);
    }
    if (!addon.actor) {
      throw new Error(`Add-on does not expose an actor for reload: ${addonId}`);
    }

    const requestTypes = await this.request({
      to: addon.actor,
      type: "requestTypes",
    });

    if (!requestTypes.requestTypes || !requestTypes.requestTypes.includes("reload")) {
      throw new Error(`Add-on reload is not supported for ${addonId}`);
    }

    await this.request({
      to: addon.actor,
      type: "reload",
    });

    return await this.waitForAddonById(addonId);
  }

  async evaluateInChrome(expression) {
    const target = await this.getParentProcessTarget();
    const consoleActor = target.consoleActor;
    if (!consoleActor) {
      throw new Error("Parent process target does not expose consoleActor");
    }

    const wrappedExpression = `(() => {
      let __cleanroomDone = false;
      let __cleanroomValue;
      let __cleanroomError;

      Promise.resolve(${expression}).then(
        (value) => {
          __cleanroomValue = value;
        },
        (error) => {
          __cleanroomError = error;
        },
      ).finally(() => {
        __cleanroomDone = true;
      });

      Services.tm.spinEventLoopUntil("cleanroom-rdp-eval", () => __cleanroomDone);

      if (__cleanroomError) {
        throw __cleanroomError;
      }

      return __cleanroomValue;
    })()`;

    await this.request({
      to: consoleActor,
      type: "startListeners",
      listeners: ["ConsoleAPI"],
    });
    await this.request({
      to: consoleActor,
      type: "clearMessagesCacheAsync",
    });

    const evaluation = await this.request({
      to: consoleActor,
      type: "evaluateJSAsync",
      text: wrappedExpression,
      await: true,
    });

    const result = await this.waitForEvent(
      (message) => (
        message.from === consoleActor
        && message.type === "evaluationResult"
        && message.resultID === evaluation.resultID
      ),
      { timeoutMs: 15000 },
    );

    if (result.hasException) {
      throw new Error(result.exceptionMessage || result.result?.preview?.message || "Chrome evaluation failed");
    }

    return await this.#unwrapEvaluationResult(result.result);
  }

  async #readLongString(longStringGrip) {
    const initial = typeof longStringGrip?.initial === "string" ? longStringGrip.initial : "";
    const length = Number.isFinite(Number(longStringGrip?.length))
      ? Number(longStringGrip.length)
      : initial.length;
    const actor = typeof longStringGrip?.actor === "string" ? longStringGrip.actor : "";
    if (!actor || length <= initial.length) {
      return initial;
    }

    let output = initial;
    let start = initial.length;
    while (start < length) {
      const end = Math.min(start + 8192, length);
      const response = await this.request({
        to: actor,
        type: "substring",
        start,
        end,
      });
      const chunk = typeof response?.substring === "string" ? response.substring : "";
      if (!chunk) {
        break;
      }
      output += chunk;
      start = output.length;
    }

    return output;
  }

  async #unwrapRdpEvaluationValue(result) {
    if (result && typeof result === "object" && result.type === "longString") {
      return await this.#readLongString(result);
    }
    return unwrapRdpValue(result);
  }

  async #unwrapEvaluationResult(result) {
    if (
      result
      && typeof result === "object"
      && result.class === "Promise"
      && result.preview
      && result.preview.ownProperties
    ) {
      const state = result.preview.ownProperties["<state>"]?.value;
      const value = result.preview.ownProperties["<value>"]?.value;
      const rejection = result.preview.ownProperties["<reason>"]?.value;

      if (state === "rejected") {
        throw new Error(`Chrome evaluation promise rejected: ${String(rejection)}`);
      }

      if (state === "fulfilled") {
        return await this.#unwrapRdpEvaluationValue(value);
      }
    }

    return await this.#unwrapRdpEvaluationValue(result);
  }

  async waitForAddonById(addonId, {
    timeoutMs = 15000,
    pollIntervalMs = 250,
  } = {}) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const response = await this.listAddons();
      const match = response.addons.find((addon) => addon.id === addonId);
      if (match) {
        return match;
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Timed out waiting for add-on ${addonId}`);
  }
}

export async function stopChildProcess(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  child.kill("SIGTERM");

  const exited = await Promise.race([
    new Promise((resolve) => {
      child.once("exit", () => resolve(true));
    }),
    new Promise((resolve) => setTimeout(() => resolve(false), 4000)),
  ]);

  if (!exited && child.exitCode === null) {
    child.kill("SIGKILL");
  }
}

export { acquireBuildLock };

export async function findFilesRecursive(rootDir, matcher) {
  const results = [];

  async function walk(currentDir) {
    let entries;
    try {
      entries = await fsp.readdir(currentDir, { withFileTypes: true });
    }
    catch (error) {
      if (error && error.code === "ENOENT") {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (entry.isFile() && matcher(fullPath)) {
        results.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  return results.sort();
}

async function collectWatchEntries(basePath, currentPath, snapshot) {
  let entries;
  try {
    entries = await fsp.readdir(currentPath, { withFileTypes: true });
  }
  catch (error) {
    if (error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    const fullPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      await collectWatchEntries(basePath, fullPath, snapshot);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }

    const stats = await fsp.stat(fullPath);
    snapshot.set(path.relative(basePath, fullPath), `${stats.mtimeMs}:${stats.size}`);
  }
}

export async function createWatchSnapshot(projectRoot, relativeRoots = DEFAULT_WATCH_ROOTS) {
  const snapshot = new Map();

  for (const relativeRoot of relativeRoots) {
    const fullRoot = path.join(projectRoot, relativeRoot);
    await collectWatchEntries(projectRoot, fullRoot, snapshot);
  }

  return snapshot;
}

export function diffWatchSnapshots(previous, next) {
  const changed = [];

  for (const [filePath, signature] of next.entries()) {
    if (!previous.has(filePath) || previous.get(filePath) !== signature) {
      changed.push(filePath);
    }
  }

  for (const filePath of previous.keys()) {
    if (!next.has(filePath)) {
      changed.push(filePath);
    }
  }

  return changed.sort();
}
