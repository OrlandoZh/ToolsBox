function toFiniteInteger(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function calculateArea(bounds) {
  const normalized = normalizeCaptureWindowBounds(bounds);
  if (!normalized) {
    return 0;
  }
  return normalized.width * normalized.height;
}

function normalizePositiveWidth(value) {
  const parsed = toFiniteInteger(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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

export function rebaseCaptureWindowBounds(bounds, previousWindowBounds, currentWindowBounds) {
  const normalizedBounds = normalizeCaptureWindowBounds(bounds);
  const normalizedPreviousWindowBounds = normalizeCaptureWindowBounds(previousWindowBounds);
  const normalizedCurrentWindowBounds = normalizeCaptureWindowBounds(currentWindowBounds);
  if (!normalizedBounds || !normalizedPreviousWindowBounds || !normalizedCurrentWindowBounds) {
    return normalizedBounds;
  }

  return {
    ...normalizedBounds,
    x: normalizedBounds.x + (normalizedCurrentWindowBounds.x - normalizedPreviousWindowBounds.x),
    y: normalizedBounds.y + (normalizedCurrentWindowBounds.y - normalizedPreviousWindowBounds.y),
    title: normalizedBounds.title || normalizedCurrentWindowBounds.title || null,
  };
}

export function inspectCaptureBoundsAlignment(bounds, windowBounds) {
  const normalizedBounds = normalizeCaptureWindowBounds(bounds);
  const normalizedWindowBounds = normalizeCaptureWindowBounds(windowBounds);
  if (!normalizedBounds || !normalizedWindowBounds) {
    return {
      ok: false,
      captureArea: calculateArea(normalizedBounds),
      windowArea: calculateArea(normalizedWindowBounds),
      overlapArea: 0,
      captureOverlapRatio: 0,
      windowOverlapRatio: 0,
    };
  }

  const overlapWidth = Math.max(
    0,
    Math.min(
      normalizedBounds.x + normalizedBounds.width,
      normalizedWindowBounds.x + normalizedWindowBounds.width,
    ) - Math.max(normalizedBounds.x, normalizedWindowBounds.x),
  );
  const overlapHeight = Math.max(
    0,
    Math.min(
      normalizedBounds.y + normalizedBounds.height,
      normalizedWindowBounds.y + normalizedWindowBounds.height,
    ) - Math.max(normalizedBounds.y, normalizedWindowBounds.y),
  );
  const captureArea = calculateArea(normalizedBounds);
  const windowArea = calculateArea(normalizedWindowBounds);
  const overlapArea = overlapWidth * overlapHeight;
  const captureOverlapRatio = captureArea > 0
    ? overlapArea / captureArea
    : 0;
  const windowOverlapRatio = windowArea > 0
    ? overlapArea / windowArea
    : 0;

  return {
    ok: captureOverlapRatio >= 0.75,
    captureArea,
    windowArea,
    overlapArea,
    captureOverlapRatio,
    windowOverlapRatio,
  };
}

function buildEdgeAnchoredCaptureBounds({
  edgeMode,
  windowBounds,
  width,
}) {
  const normalizedWindowBounds = normalizeCaptureWindowBounds(windowBounds);
  const normalizedWidth = normalizePositiveWidth(width);
  if (!normalizedWindowBounds || normalizedWidth === null) {
    return null;
  }

  const anchorRight = String(edgeMode || "").trim() === "pane-attached";
  const x = anchorRight
    ? normalizedWindowBounds.x + Math.max(0, normalizedWindowBounds.width - normalizedWidth)
    : normalizedWindowBounds.x;

  return {
    x,
    y: normalizedWindowBounds.y,
    width: normalizedWidth,
    height: normalizedWindowBounds.height,
    title: normalizedWindowBounds.title || null,
    source: `${anchorRight ? "pane" : "sidebar"}-edge+window-bounds`,
  };
}

export function resolveStageRelativeSurfaceBounds(surfaceTarget, stageWindowBounds) {
  const normalizedStageWindowBounds = normalizeCaptureWindowBounds(stageWindowBounds);
  if (!normalizedStageWindowBounds) {
    return null;
  }

  const rect = normalizeCaptureWindowBounds(surfaceTarget?.rect || null);
  const previousWindowBounds = normalizeCaptureWindowBounds(surfaceTarget?.windowBounds || null);
  const details = surfaceTarget?.details && typeof surfaceTarget.details === "object"
    ? surfaceTarget.details
    : {};
  const edgeMode = String(details.edgeMode || "").trim() || null;
  const minimumViableWidth = normalizePositiveWidth(details.minimumViableWidth);
  const rectSource = String(rect?.source || "").trim();

  if (rect) {
    if (rectSource.includes("+window-bounds") && edgeMode) {
      return buildEdgeAnchoredCaptureBounds({
        edgeMode,
        windowBounds: normalizedStageWindowBounds,
        width: rect.width,
      }) || rebaseCaptureWindowBounds(rect, previousWindowBounds, normalizedStageWindowBounds);
    }

    if (previousWindowBounds) {
      return rebaseCaptureWindowBounds(rect, previousWindowBounds, normalizedStageWindowBounds);
    }

    return {
      ...rect,
      title: rect.title || normalizedStageWindowBounds.title || null,
    };
  }

  if (edgeMode && minimumViableWidth !== null) {
    return buildEdgeAnchoredCaptureBounds({
      edgeMode,
      windowBounds: normalizedStageWindowBounds,
      width: minimumViableWidth,
    });
  }

  return normalizedStageWindowBounds;
}

export function shouldCaptureSurfaceFromReferenceStage(surfaceTarget) {
  const captureKind = String(surfaceTarget?.captureKind || "").trim();
  const surfaceEvidenceElement = String(surfaceTarget?.details?.surfaceEvidenceElement || "").trim();

  if (captureKind.startsWith("surface-reader-sidebar-")) {
    return false;
  }

  if (captureKind.startsWith("surface-menu-")) {
    return false;
  }

  if (surfaceEvidenceElement === "sidebar-panel") {
    return false;
  }

  if (
    surfaceEvidenceElement === "menu-popup"
    || surfaceEvidenceElement === "menu-submenu-popup"
  ) {
    return false;
  }

  return true;
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
