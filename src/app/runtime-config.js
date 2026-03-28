function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Runtime config invalid: missing ${label}`);
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Runtime config invalid: ${label} must be an object`);
  }
}

export function validateRuntimeConfig(config) {
  assertPlainObject(config, "config");
  assertNonEmptyString(config.addonName, "addonName");
  assertNonEmptyString(config.addonId, "addonId");
  assertNonEmptyString(config.addonRef, "addonRef");
  assertNonEmptyString(config.instanceKey, "instanceKey");
  assertNonEmptyString(config.prefsPrefix, "prefsPrefix");
  assertPlainObject(config.defaultPrefs, "defaultPrefs");
  assertNonEmptyString(config.defaultPrefs.logLevel, "defaultPrefs.logLevel");

  return config;
}

export function readRuntimeConfig() {
  if (!globalThis.__CLEANROOM_TEMPLATE_CONFIG__) {
    throw new Error("Runtime config missing");
  }

  return validateRuntimeConfig(globalThis.__CLEANROOM_TEMPLATE_CONFIG__);
}
