function freezeModules(modules = []) {
  return Object.freeze(modules.slice());
}

export const HOST_ACTION_OWNER_MODULES = Object.freeze({
  hostBridge: freezeModules([
    "module-host",
    "module-action",
  ]),
  actionHostBridge: freezeModules([
    "module-action",
    "module-host",
  ]),
  readerActionBridge: freezeModules([
    "module-reader",
    "module-action",
  ]),
  menuBridge: freezeModules([
    "module-host",
    "module-menu",
    "module-action",
  ]),
  hostOnly: freezeModules([
    "module-host",
  ]),
  reactWindowActionBridge: freezeModules([
    "module-react",
    "module-window",
    "module-action",
  ]),
  wasmProbe: freezeModules([
    "module-wasm",
    "module-action",
  ]),
  catalogOnly: freezeModules([
    "module-catalog",
  ]),
});
