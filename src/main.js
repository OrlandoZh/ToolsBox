import { createPlugin } from "./app/plugin.js";
import { readRuntimeConfig } from "./app/runtime-config.js";

let plugin = null;
let pluginConfig = null;
let bootstrapping = null;

function logBootstrapCleanupFailure(error) {
  const zotero = globalThis.Zotero;
  const event = "cleanroom.bootstrap.startup.cleanup.failed";
  const payload = {
    event,
    message: String(error?.message || error || "unknown"),
  };
  let serialized = "";
  try {
    serialized = ` ${JSON.stringify(payload)}`;
  } catch {
    serialized = "";
  }
  const message = `[cleanroom:error] ${event}${serialized}`;
  if (zotero && typeof zotero.logError === "function") {
    zotero.logError(message);
    return;
  }
  if (zotero && typeof zotero.debug === "function") {
    zotero.debug(message);
    return;
  }
  if (typeof console !== "undefined" && typeof console.error === "function") {
    console.error(message);
  }
}

function clearMountedPlugin(instance, config) {
  const instanceKey = String(config?.instanceKey || "").trim();
  if (!instanceKey || !globalThis.Zotero) {
    return;
  }

  const mounted = globalThis.Zotero[instanceKey];
  if (!mounted) {
    return;
  }

  if (!instance || mounted.api === instance.api) {
    delete globalThis.Zotero[instanceKey];
  }
}

async function shutdownPluginInstance(instance, config) {
  if (!instance || typeof instance.shutdown !== "function") {
    clearMountedPlugin(instance, config);
    return;
  }

  try {
    await instance.shutdown();
  } finally {
    clearMountedPlugin(instance, config);
  }
}

function mountPluginInstance(instance, config) {
  if (!globalThis.Zotero) {
    throw new Error("Zotero global is not available");
  }

  globalThis.Zotero[config.instanceKey] = {
    onWindowLoad: (window) => instance.onWindowLoad(window),
    onWindowUnload: (window) => instance.onWindowUnload(window),
    shutdown: async () => {
      const mountedInstance = plugin === instance ? plugin : instance;
      const mountedConfig = plugin === instance ? (pluginConfig || config) : config;
      if (plugin === instance) {
        plugin = null;
        pluginConfig = null;
      }
      bootstrapping = null;
      await shutdownPluginInstance(mountedInstance, mountedConfig);
    },
    api: instance.api,
  };
}

export async function bootstrapPlugin() {
  if (plugin) {
    return;
  }

  if (bootstrapping) {
    await bootstrapping;
    return;
  }

  const config = readRuntimeConfig();
  const instance = createPlugin({
    globalScope: globalThis,
    config,
  });

  bootstrapping = (async () => {
    try {
      await instance.start();
      mountPluginInstance(instance, config);
      plugin = instance;
      pluginConfig = config;
    } catch (error) {
      plugin = null;
      pluginConfig = null;
      await shutdownPluginInstance(instance, config).catch((cleanupError) => {
        logBootstrapCleanupFailure(cleanupError);
      });
      throw error;
    } finally {
      bootstrapping = null;
    }
  })();

  await bootstrapping;
}
