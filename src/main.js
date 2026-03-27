import { createPlugin } from "./app/plugin.js";
import { readRuntimeConfig } from "./app/runtime-config.js";

let plugin;

export async function bootstrapPlugin() {
  if (plugin) {
    return;
  }

  const config = readRuntimeConfig();
  plugin = createPlugin({
    globalScope: globalThis,
    config,
  });

  await plugin.start();

  if (!globalThis.Zotero) {
    throw new Error("Zotero global is not available");
  }

  globalThis.Zotero[config.instanceKey] = {
    onWindowLoad: (window) => plugin.onWindowLoad(window),
    onWindowUnload: (window) => plugin.onWindowUnload(window),
    shutdown: () => plugin.shutdown(),
    api: plugin.api,
  };
}
