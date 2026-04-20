const MODE = "legacy-backend-v0";
const DEFAULT_IDENTITY_KIND = "zotero-user-id";
const DEFAULT_CACHE_TTL_MS = 86400000;

const STATUS = Object.freeze({
  DISABLED: "disabled",
  IDLE: "idle",
  PENDING: "pending",
  VALIDATED: "validated",
  CACHE_HIT: "cache-hit",
  DEGRADED: "degraded",
  ERROR: "error",
});

function normalizeString(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeNumber(value, fallback, { min = 0 } = {}) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(min, numeric) : fallback;
}

function toErrorMessage(error) {
  if (!error) {
    return "unknown";
  }
  if (typeof error === "string") {
    return error;
  }
  return String(error.message || error);
}

function cloneSummary(summary = {}) {
  return {
    mode: MODE,
    configured: Boolean(summary.configured),
    status: normalizeString(summary.status) || STATUS.DISABLED,
    identityKind: normalizeString(summary.identityKind) || DEFAULT_IDENTITY_KIND,
    cacheAvailable: Boolean(summary.cacheAvailable),
    cacheFresh: Boolean(summary.cacheFresh),
    validationSource: normalizeString(summary.validationSource) || "none",
    gateSatisfied: Boolean(summary.gateSatisfied),
    compactGateHex: normalizeString(summary.compactGateHex),
    lastValidatedAt: normalizeString(summary.lastValidatedAt),
    expiresAt: normalizeString(summary.expiresAt),
    failureKind: normalizeString(summary.failureKind),
  };
}

function buildDefaultSummary({ configured = false, identityKind = DEFAULT_IDENTITY_KIND } = {}) {
  return cloneSummary({
    configured,
    status: configured ? STATUS.IDLE : STATUS.DISABLED,
    identityKind,
  });
}

function summarizeCache(cacheSummary = null) {
  return {
    cacheAvailable: Boolean(cacheSummary?.cacheAvailable),
    cacheFresh: Boolean(cacheSummary?.cacheFresh),
    validationSource: normalizeString(cacheSummary?.validationSource) || "none",
    gateSatisfied: Boolean(cacheSummary?.gateSatisfied),
    compactGateHex: normalizeString(cacheSummary?.compactGateHex),
    lastValidatedAt: normalizeString(cacheSummary?.lastValidatedAt),
    expiresAt: normalizeString(cacheSummary?.expiresAt),
    failureKind: normalizeString(cacheSummary?.storeError),
  };
}

export function createEntitlementControlPlane({
  config = {},
  http,
  identityProvider,
  adapter,
  cacheStore,
  getHostBinding,
  getWasmKernelProbe,
  logger = null,
  now = () => Date.now(),
} = {}) {
  const configured = Boolean(config?.enabled === true && adapter?.isConfigured?.());
  const identityKind = normalizeString(config?.identityKind || identityProvider?.kind) || DEFAULT_IDENTITY_KIND;
  const cacheTTLMS = normalizeNumber(config?.cacheTTLMS, DEFAULT_CACHE_TTL_MS, { min: 1 });
  let summary = buildDefaultSummary({ configured, identityKind });
  let pendingResolve = null;

  function updateSummary(patch = {}) {
    summary = cloneSummary({
      ...summary,
      ...patch,
      configured,
      identityKind,
    });
    if (logger && typeof logger.debug === "function") {
      logger.debug("packageProtection.controlPlane.updated", {
        status: summary.status,
        configured: summary.configured,
        validationSource: summary.validationSource,
        gateSatisfied: summary.gateSatisfied,
        failureKind: summary.failureKind,
      });
    }
    return cloneSummary(summary);
  }

  function getSummary() {
    return cloneSummary({
      ...summary,
      ...summarizeCache(cacheStore?.getSummary?.()),
      status: summary.status,
      configured,
      identityKind,
      failureKind: summary.failureKind || summarizeCache(cacheStore?.getSummary?.()).failureKind,
    });
  }

  async function resolveNetwork({ identity, hostBinding, prepared }) {
    if (typeof http?.postJSON !== "function") {
      throw new Error("HTTP JSON client is unavailable");
    }

    const responsePayload = await http.postJSON(
      prepared.endpoint,
      adapter.buildHTTPPayload(prepared),
      {
        timeout: Number(prepared.timeoutMs || config?.timeoutMs || 8000),
        retryCount: 0,
      },
    );

    return await adapter.evaluateResponse({
      identity,
      hostBinding,
      responsePayload,
      wasmKernelProbe: getWasmKernelProbe,
    });
  }

  async function resolveOnce({ forceRefresh = false } = {}) {
    if (!configured) {
      return updateSummary({
        status: STATUS.DISABLED,
        validationSource: "none",
        gateSatisfied: false,
        failureKind: null,
      });
    }

    updateSummary({
      status: STATUS.PENDING,
      failureKind: null,
    });

    let identity = null;
    let prepared = null;
    const hostBinding = typeof getHostBinding === "function" ? getHostBinding() : null;

    try {
      identity = await identityProvider.resolve();
      if (identity?.ok !== true) {
        return updateSummary({
          ...summarizeCache(cacheStore?.getSummary?.()),
          status: STATUS.DEGRADED,
          validationSource: "none",
          gateSatisfied: false,
          failureKind: identity?.failureKind || "identity-unavailable",
        });
      }

      prepared = await adapter.prepareRequest({
        identity,
        hostBinding,
        wasmKernelProbe: getWasmKernelProbe,
      });

      const cached = forceRefresh || typeof cacheStore?.readFresh !== "function"
        ? null
        : await cacheStore.readFresh(prepared.cacheFingerprint, now());
      if (cached) {
        return updateSummary({
          status: STATUS.CACHE_HIT,
          cacheAvailable: true,
          cacheFresh: true,
          validationSource: "cache",
          gateSatisfied: cached.gateSatisfied === true,
          compactGateHex: cached.compactGateHex,
          lastValidatedAt: cached.lastValidatedAt,
          expiresAt: cached.expiresAt,
          failureKind: null,
        });
      }

      const evaluation = await resolveNetwork({
        identity,
        hostBinding,
        prepared,
      });
      const timestamp = new Date(now()).toISOString();
      const expiresAt = new Date(now() + cacheTTLMS).toISOString();
      const record = {
        cacheFingerprint: prepared.cacheFingerprint || evaluation.cacheFingerprint,
        hostBindingDigest: prepared.hostBindingDigest || evaluation.hostBindingDigest,
        validationSource: "fresh-network",
        gateSatisfied: evaluation.gateSatisfied === true,
        compactGateHex: evaluation.compactGateHex,
        lastValidatedAt: timestamp,
        expiresAt,
      };

      if (typeof cacheStore?.write === "function") {
        await cacheStore.write(record);
      }

      return updateSummary({
        status: evaluation.gateSatisfied === true ? STATUS.VALIDATED : STATUS.DEGRADED,
        cacheAvailable: true,
        cacheFresh: true,
        validationSource: "fresh-network",
        gateSatisfied: evaluation.gateSatisfied === true,
        compactGateHex: evaluation.compactGateHex,
        lastValidatedAt: timestamp,
        expiresAt,
        failureKind: evaluation.gateSatisfied === true
          ? null
          : (evaluation.failureKind || "gate-mismatch"),
      });
    } catch (error) {
      return updateSummary({
        ...summarizeCache(cacheStore?.getSummary?.()),
        status: STATUS.DEGRADED,
        validationSource: "none",
        gateSatisfied: false,
        compactGateHex: prepared?.compactGateHex || null,
        failureKind: toErrorMessage(error),
      });
    }
  }

  async function resolve(options = {}) {
    if (pendingResolve && options?.forceRefresh !== true) {
      return pendingResolve;
    }

    pendingResolve = resolveOnce(options)
      .finally(() => {
        pendingResolve = null;
      });
    return await pendingResolve;
  }

  function scheduleResolve() {
    if (!configured || pendingResolve) {
      return null;
    }
    pendingResolve = resolveOnce()
      .catch((error) => updateSummary({
        status: STATUS.DEGRADED,
        failureKind: toErrorMessage(error),
      }))
      .finally(() => {
        pendingResolve = null;
      });
    return pendingResolve;
  }

  return {
    resolve,
    scheduleResolve,
    getSummary,
    isConfigured() {
      return configured;
    },
  };
}
