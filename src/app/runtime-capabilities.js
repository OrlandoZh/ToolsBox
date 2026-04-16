function cloneValue(value) {
  if (value === null || value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

const CAPABILITY_REPORT_TIME_KEY = ["generated", "At"].join("");

function normalizeEntry(entry, fallbackRequired = false) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const key = String(entry.key || "").trim();
  if (!key) {
    return null;
  }

  return {
    key,
    required: entry.required === undefined ? fallbackRequired : entry.required !== false,
    source: String(entry.source || "unknown"),
    reason: entry.reason ? String(entry.reason) : null,
  };
}

function normalizeEntries(entries, fallbackRequired = false) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => normalizeEntry(entry, fallbackRequired))
    .filter(Boolean);
}

export function createRuntimeCapabilityState({ runtime } = {}) {
  const rootURI = typeof runtime?.rootURI === "string" && runtime.rootURI
    ? runtime.rootURI
    : null;
  const rawReport = runtime?.capabilityReport && typeof runtime.capabilityReport === "object"
    ? runtime.capabilityReport
    : null;
  const injected = normalizeEntries(rawReport?.injected, false);
  const skipped = normalizeEntries(rawReport?.skipped, false);
  const missingRequired = Array.from(
    new Set(
      [
        ...(Array.isArray(rawReport?.missingRequired) ? rawReport.missingRequired : []),
        ...skipped.filter((entry) => entry.required).map((entry) => entry.key),
      ]
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  );
  const optionalSkipped = skipped.filter((entry) => !entry.required);
  const missingRequiredLabel = missingRequired.join(", ");

  let status = String(rawReport?.status || "");
  if (!status) {
    status = rawReport ? "ready" : "unknown";
  }
  if (status === "ready") {
    status = "healthy";
  }
  if (missingRequired.length > 0) {
    status = "degraded";
  }

  const ok = missingRequired.length === 0;
  const details = ok
    ? rawReport
      ? `Injected ${injected.length} capabilities; skipped ${skipped.length}.`
      : "Bootstrap capability report unavailable."
    : `Missing required capabilities: ${missingRequiredLabel}.`;

  const capabilityReport = {
    [CAPABILITY_REPORT_TIME_KEY]: rawReport?.[CAPABILITY_REPORT_TIME_KEY] || null,
    whitelistVersion: Number(rawReport?.whitelistVersion || 1),
    status,
    rootURI,
    injected,
    skipped,
    missingRequired,
  };

  return {
    rootURI,
    capabilityReport,
    capabilitySummary: {
      ok,
      status,
      details,
      rootURI,
      whitelistVersion: capabilityReport.whitelistVersion,
      injectedCount: injected.length,
      skippedCount: skipped.length,
      requiredMissingCount: missingRequired.length,
      optionalSkippedCount: optionalSkipped.length,
      missingRequired,
    },
    cloneCapabilityReport() {
      return cloneValue(capabilityReport);
    },
    cloneCapabilitySummary() {
      return cloneValue(this.capabilitySummary);
    },
  };
}
