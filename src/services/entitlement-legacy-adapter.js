const DEFAULT_MODE = "legacy-backend-v0";
const DEFAULT_PROTOCOL = "relationgraph-hmac-md5-link";
const DEFAULT_TIMEOUT_MS = 8000;

function normalizeString(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeNumber(value, fallback, { min = 0 } = {}) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(min, numeric) : fallback;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sanitizeRequestFields(fields = null) {
  const normalized = fields && typeof fields === "object" ? fields : {};
  return {
    username: normalizeString(normalized.username),
    serial: normalizeString(normalized.serial),
  };
}

function sanitizePrepared(prepared = null) {
  return {
    mode: normalizeString(prepared?.mode) || DEFAULT_MODE,
    protocol: normalizeString(prepared?.protocol) || DEFAULT_PROTOCOL,
    requestFields: sanitizeRequestFields(prepared?.requestFields),
    cacheFingerprint: normalizeString(prepared?.cacheFingerprint),
    hostBindingDigest: normalizeString(prepared?.hostBindingDigest),
    requestDigestHex: normalizeString(prepared?.requestDigestHex),
    compactGateHex: normalizeString(prepared?.compactGateHex),
  };
}

function sanitizeEvaluation(evaluation = null) {
  return {
    mode: normalizeString(evaluation?.mode) || DEFAULT_MODE,
    protocol: normalizeString(evaluation?.protocol) || DEFAULT_PROTOCOL,
    gateSatisfied: Boolean(evaluation?.gateSatisfied),
    compactGateHex: normalizeString(evaluation?.compactGateHex),
    validationDigestHex: normalizeString(evaluation?.validationDigestHex),
    cacheFingerprint: normalizeString(evaluation?.cacheFingerprint),
    hostBindingDigest: normalizeString(evaluation?.hostBindingDigest),
    failureKind: normalizeString(evaluation?.failureKind),
  };
}

async function resolveKernel(kernelSource) {
  return typeof kernelSource === "function"
    ? await kernelSource()
    : kernelSource;
}

export function createEntitlementLegacyAdapter({
  endpoint,
  secret,
  protocol = DEFAULT_PROTOCOL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const normalizedEndpoint = normalizeString(endpoint);
  const normalizedSecret = normalizeString(secret);
  const normalizedProtocol = normalizeString(protocol) || DEFAULT_PROTOCOL;
  const normalizedTimeoutMs = normalizeNumber(timeoutMs, DEFAULT_TIMEOUT_MS, { min: 1 });

  function isConfigured() {
    return Boolean(normalizedEndpoint && normalizedSecret);
  }

  function getSummary() {
    return {
      mode: DEFAULT_MODE,
      protocol: normalizedProtocol,
      configured: isConfigured(),
      timeoutMs: normalizedTimeoutMs,
    };
  }

  async function prepareRequest({
    identity,
    hostBinding,
    wasmKernelProbe,
  } = {}) {
    if (!isConfigured()) {
      throw new Error("legacy entitlement adapter is not configured");
    }

    const kernel = await resolveKernel(wasmKernelProbe);
    if (typeof kernel?.prepareLegacyEntitlementRequest !== "function") {
      throw new Error("wasm entitlement request derivation is unavailable");
    }

    const prepared = await kernel.prepareLegacyEntitlementRequest({
      mode: "main-thread",
      protocol: normalizedProtocol,
      identityKind: identity?.kind,
      identityValue: identity?.value,
      hostBinding,
      legacySecret: normalizedSecret,
    });

    return {
      ...sanitizePrepared(prepared?.mainThread || prepared),
      endpoint: normalizedEndpoint,
      timeoutMs: normalizedTimeoutMs,
    };
  }

  async function evaluateResponse({
    identity,
    hostBinding,
    responsePayload,
    wasmKernelProbe,
  } = {}) {
    if (!isConfigured()) {
      throw new Error("legacy entitlement adapter is not configured");
    }

    const kernel = await resolveKernel(wasmKernelProbe);
    if (typeof kernel?.evaluateLegacyEntitlementResponse !== "function") {
      throw new Error("wasm entitlement response evaluation is unavailable");
    }

    const evaluation = await kernel.evaluateLegacyEntitlementResponse({
      mode: "main-thread",
      protocol: normalizedProtocol,
      identityKind: identity?.kind,
      identityValue: identity?.value,
      hostBinding,
      legacySecret: normalizedSecret,
      responsePayload,
    });

    return sanitizeEvaluation(evaluation?.mainThread || evaluation);
  }

  function buildHTTPPayload(prepared = {}) {
    return clone(sanitizeRequestFields(prepared.requestFields));
  }

  return {
    protocol: normalizedProtocol,
    isConfigured,
    getSummary,
    prepareRequest,
    evaluateResponse,
    buildHTTPPayload,
  };
}
