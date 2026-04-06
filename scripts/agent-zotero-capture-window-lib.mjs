function toFiniteInteger(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeCaptureWindowBounds(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const x = toFiniteInteger(value.x);
  const y = toFiniteInteger(value.y);
  const width = toFiniteInteger(value.width);
  const height = toFiniteInteger(value.height);
  const windowNumber = toFiniteInteger(value.windowNumber);

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }
  if (width <= 0 || height <= 0) {
    return null;
  }

  const title = String(value.title || "").trim();
  const source = String(value.source || "").trim();

  return {
    x,
    y,
    width,
    height,
    title: title || null,
    source: source || null,
    ...(Number.isFinite(windowNumber) && windowNumber > 0
      ? { windowNumber }
      : {}),
  };
}

export async function resolveCaptureWindowBounds({
  preferred,
  fallback,
}) {
  let lastError = null;

  if (typeof preferred === "function") {
    try {
      const preferredBounds = normalizeCaptureWindowBounds(await preferred());
      if (preferredBounds) {
        return preferredBounds;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (typeof fallback === "function") {
    try {
      const fallbackBounds = normalizeCaptureWindowBounds(await fallback());
      if (fallbackBounds) {
        return fallbackBounds;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error("Unable to resolve capture window bounds");
}
