const LOG_LEVEL_OPTIONS = ["debug", "info", "warn", "error"];

const PRESET_GROUP_BY_KEY = {
  enabled: "core",
  logLevel: "core",
  menuLabel: "ui",
};

const PRESET_DESCRIPTION_BY_KEY = {
  enabled: "控制插件功能是否启用。",
  logLevel: "控制插件日志级别。",
  menuLabel: "覆盖默认菜单文案。",
};

function inferSettingType(value) {
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "number") {
    return "number";
  }
  return "string";
}

function normalizeSchemaOverrides(overrides) {
  if (!overrides) {
    return [];
  }
  if (Array.isArray(overrides)) {
    return overrides.filter(Boolean);
  }
  if (typeof overrides === "object") {
    return Object.entries(overrides).map(([key, value]) => ({
      key,
      ...(value && typeof value === "object" ? value : {}),
    }));
  }
  return [];
}

function normalizeDefinition(input, fallbackDefaultValue) {
  const key = String(input?.key || "").trim();
  if (!key) {
    return null;
  }

  const baseDefaultValue = input?.defaultValue !== undefined
    ? input.defaultValue
    : fallbackDefaultValue;
  const type = String(input?.type || inferSettingType(baseDefaultValue)).toLowerCase();
  const defaultValue = baseDefaultValue !== undefined
    ? baseDefaultValue
    : (type === "boolean" ? false : (type === "number" ? 0 : ""));

  const definition = {
    key,
    type,
    defaultValue,
    group: String(input?.group || PRESET_GROUP_BY_KEY[key] || "custom"),
    description: String(input?.description || PRESET_DESCRIPTION_BY_KEY[key] || ""),
    allowedValues: Array.isArray(input?.allowedValues)
      ? input.allowedValues.slice()
      : null,
    min: Number.isFinite(input?.min) ? Number(input.min) : null,
    max: Number.isFinite(input?.max) ? Number(input.max) : null,
    integerOnly: Boolean(input?.integerOnly),
    requiresRestart: Boolean(input?.requiresRestart),
  };

  if (key === "logLevel" && !definition.allowedValues) {
    definition.allowedValues = LOG_LEVEL_OPTIONS.slice();
  }

  return definition;
}

export function createSettingsSchema({ defaultPrefs = {}, overrides = [] } = {}) {
  const schemaMap = new Map();

  Object.entries(defaultPrefs || {}).forEach(([key, value]) => {
    const definition = normalizeDefinition({ key, defaultValue: value }, value);
    if (definition) {
      schemaMap.set(definition.key, definition);
    }
  });

  normalizeSchemaOverrides(overrides).forEach((candidate) => {
    const current = schemaMap.get(String(candidate?.key || "").trim());
    const definition = normalizeDefinition(candidate, current?.defaultValue);
    if (definition) {
      schemaMap.set(definition.key, {
        ...(current || {}),
        ...definition,
      });
    }
  });

  return Array.from(schemaMap.values()).sort((left, right) => {
    return left.key.localeCompare(right.key);
  });
}

export { LOG_LEVEL_OPTIONS };
