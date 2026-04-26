function freezeModules(modules = []) {
  return Object.freeze(modules.slice());
}

export const HOST_ACTION_OWNER_MODULES = Object.freeze({
  hostBridge: freezeModules([
    "src/platform/zotero-host.js",
    "dev/agent-runtime/host-actions.js",
  ]),
  actionHostBridge: freezeModules([
    "dev/agent-runtime/host-actions.js",
    "src/platform/zotero-host.js",
  ]),
  readerActionBridge: freezeModules([
    "src/features/reader.js",
    "dev/agent-runtime/host-actions.js",
  ]),
  menuBridge: freezeModules([
    "src/platform/zotero-host.js",
    "src/features/menu-manager.js",
    "dev/agent-runtime/host-actions.js",
  ]),
  hostOnly: freezeModules([
    "src/platform/zotero-host.js",
  ]),
  reactWindowActionBridge: freezeModules([
    "src/features/react-ui-demo.js",
    "src/utils/window-shell.js",
    "dev/agent-runtime/host-actions.js",
  ]),
  wasmProbe: freezeModules([
    "src/features/wasm-kernel-probe.js",
    "dev/agent-runtime/host-actions.js",
  ]),
  catalogOnly: freezeModules([
    "dev/agent-runtime/host-action-catalog.js",
  ]),
});
