import { createPreferenceStore } from "../core/prefs.js";
import { createSettingsSchema } from "./schema.js";
import {
  applySettingsMigrations,
  DEFAULT_SETTINGS_SCHEMA_VERSION,
  DEFAULT_VERSION_PREF_KEY,
} from "./migrations.js";
import { validateSettingValue } from "./validator.js";

function toSchemaMap(definitions) {
  return new Map((Array.isArray(definitions) ? definitions : []).map((item) => [item.key, item]));
}

function normalizeKey(key) {
  return String(key || "").trim();
}

export function createSettingsStore({
  prefBranch,
  defaultPrefs = {},
  schemaDefinitions = [],
  schemaVersion = DEFAULT_SETTINGS_SCHEMA_VERSION,
  migrations = [],
  logger = null,
} = {}) {
  const prefStore = createPreferenceStore({
    prefBranch,
    defaults: defaultPrefs,
  });
  const schema = createSettingsSchema({
    defaultPrefs,
    overrides: schemaDefinitions,
  });
  const schemaMap = toSchemaMap(schema);
  const migrationSummary = applySettingsMigrations({
    prefBranch,
    migrations,
    targetVersion: schemaVersion,
    versionPrefKey: DEFAULT_VERSION_PREF_KEY,
    logger,
  });

  function ensureDefaults() {
    prefStore.ensureDefaults();
    schema.forEach((definition) => {
      const value = prefStore.get(definition.key);
      const validation = validateSettingValue(definition, value);
      if (!validation.ok) {
        prefStore.set(definition.key, definition.defaultValue);
        if (logger && typeof logger.warn === "function") {
          logger.warn("settings.default-reset", {
            key: definition.key,
            reason: validation.reason,
          });
        }
        return;
      }
      if (validation.value !== value) {
        prefStore.set(definition.key, validation.value);
      }
    });
  }

  function get(key, options = {}) {
    const normalizedKey = normalizeKey(key);
    const definition = schemaMap.get(normalizedKey);
    const value = prefStore.get(normalizedKey);

    if (!definition) {
      return value;
    }

    const validation = validateSettingValue(definition, value);
    if (!validation.ok && options.fallbackToDefault !== false) {
      return definition.defaultValue;
    }
    return validation.ok ? validation.value : value;
  }

  function set(key, value, options = {}) {
    const normalizedKey = normalizeKey(key);
    const definition = schemaMap.get(normalizedKey);
    const allowUnknown = options.allowUnknown !== false;

    if (!definition) {
      if (!allowUnknown) {
        throw new Error(`Unknown setting key: ${normalizedKey}`);
      }
      prefStore.set(normalizedKey, value);
      return value;
    }

    const validation = validateSettingValue(definition, value);
    if (!validation.ok) {
      throw new Error(`Invalid setting value for ${normalizedKey}: ${validation.reason}`);
    }

    prefStore.set(normalizedKey, validation.value);
    return validation.value;
  }

  function clear(key) {
    prefStore.clear(normalizeKey(key));
  }

  function onChange(handler, options = {}) {
    return prefStore.onChange((changedKey) => {
      if (options.withDefinition) {
        handler(changedKey, schemaMap.get(changedKey) || null);
        return;
      }
      handler(changedKey);
    });
  }

  function isKnownKey(key) {
    return schemaMap.has(normalizeKey(key));
  }

  function getDefinition(key) {
    const definition = schemaMap.get(normalizeKey(key));
    return definition ? { ...definition } : null;
  }

  function listDefinitions() {
    return schema.map((item) => ({ ...item }));
  }

  function validate(key, value) {
    const definition = schemaMap.get(normalizeKey(key));
    if (!definition) {
      return {
        ok: true,
        value,
        reason: null,
      };
    }
    const result = validateSettingValue(definition, value);
    return {
      ok: result.ok,
      value: result.value,
      reason: result.reason || null,
    };
  }

  return {
    ensureDefaults,
    get,
    set,
    clear,
    onChange,
    validate,
    isKnownKey,
    getDefinition,
    listDefinitions,
    getMigrationSummary() {
      return { ...migrationSummary, appliedMigrations: migrationSummary.appliedMigrations.slice(), notes: migrationSummary.notes.slice() };
    },
  };
}
