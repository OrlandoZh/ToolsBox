function normalizeBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  return null;
}

function normalizeNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function validateString(definition, value) {
  const normalized = String(value ?? "");
  if (Array.isArray(definition.allowedValues) && definition.allowedValues.length > 0) {
    if (!definition.allowedValues.includes(normalized)) {
      return {
        ok: false,
        reason: "invalid-enum",
        value: normalized,
      };
    }
  }
  return {
    ok: true,
    value: normalized,
  };
}

function validateBoolean(_definition, value) {
  const normalized = normalizeBoolean(value);
  if (normalized === null) {
    return {
      ok: false,
      reason: "invalid-boolean",
      value,
    };
  }
  return {
    ok: true,
    value: normalized,
  };
}

function validateNumber(definition, value) {
  const normalized = normalizeNumber(value);
  if (normalized === null) {
    return {
      ok: false,
      reason: "invalid-number",
      value,
    };
  }

  if (definition.integerOnly && !Number.isInteger(normalized)) {
    return {
      ok: false,
      reason: "not-integer",
      value: normalized,
    };
  }

  if (Number.isFinite(definition.min) && normalized < definition.min) {
    return {
      ok: false,
      reason: "below-min",
      value: normalized,
    };
  }

  if (Number.isFinite(definition.max) && normalized > definition.max) {
    return {
      ok: false,
      reason: "above-max",
      value: normalized,
    };
  }

  return {
    ok: true,
    value: normalized,
  };
}

export function validateSettingValue(definition, value) {
  if (!definition || typeof definition !== "object") {
    return {
      ok: true,
      value,
    };
  }

  const type = String(definition.type || "string").toLowerCase();
  if (type === "boolean") {
    return validateBoolean(definition, value);
  }
  if (type === "number") {
    return validateNumber(definition, value);
  }
  return validateString(definition, value);
}
