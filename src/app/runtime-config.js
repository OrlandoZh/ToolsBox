export function readRuntimeConfig() {
  if (!globalThis.__CLEANROOM_TEMPLATE_CONFIG__) {
    throw new Error("Runtime config missing");
  }

  return globalThis.__CLEANROOM_TEMPLATE_CONFIG__;
}
