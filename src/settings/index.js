import { createSettingsStore } from "./store.js";
import { createSettingsSchema } from "./schema.js";
import { validateSettingValue } from "./validator.js";
import {
  applySettingsMigrations,
  DEFAULT_SETTINGS_SCHEMA_VERSION,
  DEFAULT_VERSION_PREF_KEY,
} from "./migrations.js";

export function createSettingsSystem(options = {}) {
  return createSettingsStore(options);
}

export {
  createSettingsStore,
  createSettingsSchema,
  validateSettingValue,
  applySettingsMigrations,
  DEFAULT_SETTINGS_SCHEMA_VERSION,
  DEFAULT_VERSION_PREF_KEY,
};
