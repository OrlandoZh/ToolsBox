const DEFAULT_PROVIDER_ID = "noop/mock-local";
const CUSTOM_EXTERNAL_PROVIDER_ID = "custom/external-api";
const DEFAULT_PREVIEW_LIMIT = 160;
const DEFAULT_CUSTOM_EXTERNAL_TIMEOUT_MS = 5000;
const SUPPORTED_CAPABILITIES = new Set(["summarizeItem", "invokeExternal"]);

function safeString(value) {
  return String(value ?? "");
}

function uniqueStrings(values) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => safeString(value).trim())
    .filter(Boolean)));
}

function readPref(prefs, key, fallback = "") {
  try {
    const value = typeof prefs?.get === "function" ? prefs.get(key) : undefined;
    return value === undefined || value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function readBoolPref(prefs, key, fallback = false) {
  const value = readPref(prefs, key, fallback);
  if (value === true || value === false) {
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
  return Boolean(value);
}

function readField(input, field) {
  try {
    if (typeof input?.getField === "function") {
      return input.getField(field) || "";
    }
  } catch {}
  return "";
}

function readInputValue(input, key, fallback = "") {
  if (Object.prototype.hasOwnProperty.call(Object(input), key)) {
    return input[key];
  }
  return fallback;
}

function parseEndpointHost(endpoint) {
  const text = safeString(endpoint).trim();
  if (!text) {
    return null;
  }
  try {
    return new URL(text).host || null;
  } catch {
    return null;
  }
}

function parseEndpointURL(endpoint) {
  const text = safeString(endpoint).trim();
  if (!text) {
    return null;
  }
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function normalizeCapability(capability) {
  const text = safeString(capability).trim();
  return SUPPORTED_CAPABILITIES.has(text) ? text : "";
}

export function normalizeProviderDescriptor(descriptor = {}) {
  const privacy = descriptor.privacy || {};
  const capabilities = uniqueStrings(descriptor.capabilities)
    .filter((capability) => SUPPORTED_CAPABILITIES.has(capability));
  return Object.freeze({
    id: safeString(descriptor.id || DEFAULT_PROVIDER_ID).trim() || DEFAULT_PROVIDER_ID,
    label: safeString(descriptor.label || descriptor.id || DEFAULT_PROVIDER_ID).trim() || DEFAULT_PROVIDER_ID,
    enabled: descriptor.enabled !== false,
    capabilities,
    privacy: Object.freeze({
      networkAllowed: Boolean(privacy.networkAllowed || descriptor.networkAllowed),
      sendsContent: Boolean(privacy.sendsContent),
      storesContent: Boolean(privacy.storesContent),
      policy: safeString(privacy.policy || "local-no-network"),
    }),
  });
}

export function buildAIRequestPreview(input = {}, options = {}) {
  const capability = normalizeCapability(options.capability || options.requestedCapability) || "unknown";
  const maxPreviewLength = Number.isFinite(options.maxPreviewLength) && options.maxPreviewLength >= 0
    ? Math.floor(options.maxPreviewLength)
    : DEFAULT_PREVIEW_LIMIT;
  const title = safeString(
    options.title
    || readInputValue(input, "title")
    || readField(input, "title"),
  ).trim();
  const abstract = safeString(
    options.abstract
    || readInputValue(input, "abstract")
    || readInputValue(input, "abstractNote")
    || readField(input, "abstractNote")
    || readField(input, "abstract"),
  ).trim();
  const itemType = safeString(
    options.itemType
    || readInputValue(input, "itemType")
    || readField(input, "itemType"),
  ).trim();
  const endpoint = safeString(options.endpoint || readInputValue(input, "endpoint")).trim();
  const abstractPreview = maxPreviewLength > 0
    ? abstract.slice(0, maxPreviewLength)
    : "";
  const contentFields = [];
  if (title) {
    contentFields.push("title");
  }
  if (abstract) {
    contentFields.push("abstract");
  }

  return Object.freeze({
    capability,
    consumer: safeString(options.consumer || "").trim(),
    itemType,
    title,
    hasAbstract: abstract.length > 0,
    abstractLength: abstract.length,
    abstractPreview,
    contentFields,
    endpointConfigured: endpoint.length > 0,
    endpointHost: parseEndpointHost(endpoint),
    networkAllowed: options.networkAllowed === true,
  });
}

export function normalizeAIProviderResult(result = {}) {
  const status = safeString(result.status || "unavailable").trim() || "unavailable";
  const ok = result.ok === true;
  return Object.freeze({
    ok,
    status,
    providerID: safeString(result.providerID || DEFAULT_PROVIDER_ID),
    capability: safeString(result.capability || ""),
    reason: safeString(result.reason || status),
    networkUsed: ok && result.networkUsed === true,
    mock: result.mock !== false,
    httpStatus: Number.isFinite(result.httpStatus) ? Number(result.httpStatus) : null,
    requestPreview: result.requestPreview || null,
    summary: safeString(result.summary || ""),
    response: result.response || null,
    responsePreview: safeString(result.responsePreview || ""),
    error: result.error ? safeString(result.error) : "",
  });
}

export function createNoNetworkAIProvider({ logger } = {}) {
  const descriptor = normalizeProviderDescriptor({
    id: DEFAULT_PROVIDER_ID,
    label: "No-network local mock provider",
    capabilities: ["summarizeItem", "invokeExternal"],
    privacy: {
      networkAllowed: false,
      sendsContent: false,
      storesContent: false,
      policy: "local-no-network",
    },
  });

  function unavailable(capability, input, options = {}) {
    const requestPreview = buildAIRequestPreview(input, {
      ...options,
      capability,
    });
    const reason = capability === "invokeExternal" && !requestPreview.endpointConfigured
      ? "endpoint-missing"
      : "network-disabled";
    logger?.debug?.("aiProvider.noNetwork.unavailable", {
      capability,
      reason,
    });
    return normalizeAIProviderResult({
      ok: false,
      status: "unavailable",
      providerID: descriptor.id,
      capability,
      reason,
      requestPreview,
      summary: capability === "summarizeItem"
        ? `No-network summary preview: ${requestPreview.title || "Untitled item"}`
        : "",
      response: capability === "invokeExternal"
        ? {
            endpointConfigured: requestPreview.endpointConfigured,
            endpointHost: requestPreview.endpointHost,
          }
        : null,
    });
  }

  return Object.freeze({
    getDescriptor() {
      return descriptor;
    },
    can(capability) {
      return descriptor.capabilities.includes(capability);
    },
    summarizeItem(input, options = {}) {
      return unavailable("summarizeItem", input, options);
    },
    invokeExternal(input, options = {}) {
      return unavailable("invokeExternal", input, options);
    },
    testConnection() {
      return normalizeAIProviderResult({
        ok: false,
        status: "unavailable",
        providerID: descriptor.id,
        capability: "testConnection",
        reason: "network-disabled",
      });
    },
  });
}

async function readResponsePreview(response) {
  if (!response) {
    return {
      bodyText: "",
      parsedJSON: null,
    };
  }

  if (typeof response.text === "function") {
    const bodyText = safeString(await response.text());
    try {
      return {
        bodyText,
        parsedJSON: bodyText ? JSON.parse(bodyText) : null,
      };
    } catch {
      return {
        bodyText,
        parsedJSON: null,
      };
    }
  }

  if (typeof response.json === "function") {
    const parsedJSON = await response.json();
    return {
      bodyText: JSON.stringify(parsedJSON),
      parsedJSON,
    };
  }

  return {
    bodyText: "",
    parsedJSON: null,
  };
}

function buildDefaultExternalRequest(input = {}, options = {}) {
  const requestPreview = buildAIRequestPreview(input, {
    ...options,
    capability: "invokeExternal",
    consumer: options.consumer || "customExternalAPI",
    networkAllowed: true,
  });
  return {
    schemaVersion: 1,
    capability: "invokeExternal",
    consumer: options.consumer || "customExternalAPI",
    payload: {
      itemID: input.itemID ?? null,
      key: safeString(input.key || ""),
      title: safeString(input.title || ""),
      itemType: safeString(input.itemType || ""),
      abstract: safeString(input.abstract || input.abstractNote || ""),
      doi: safeString(input.doi || ""),
      tags: uniqueStrings(input.tags),
      requestPreview,
    },
  };
}

export function createCustomExternalAPIProvider({ fetchImpl, logger, timeoutMs } = {}) {
  const descriptor = normalizeProviderDescriptor({
    id: CUSTOM_EXTERNAL_PROVIDER_ID,
    label: "Custom External API",
    capabilities: ["invokeExternal"],
    privacy: {
      networkAllowed: true,
      sendsContent: true,
      storesContent: false,
      policy: "explicit-opt-in-endpoint",
    },
  });
  const effectiveTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? Math.floor(timeoutMs)
    : DEFAULT_CUSTOM_EXTERNAL_TIMEOUT_MS;

  function unavailable(reason, input = {}, options = {}) {
    return normalizeAIProviderResult({
      ok: false,
      status: reason === "network-disabled" ? "unavailable" : "error",
      providerID: descriptor.id,
      capability: "invokeExternal",
      reason,
      networkUsed: false,
      mock: false,
      requestPreview: buildAIRequestPreview(input, {
        ...options,
        capability: "invokeExternal",
        consumer: options.consumer || "customExternalAPI",
        networkAllowed: options.networkPolicy === "allow-network",
      }),
      response: {
        endpointConfigured: Boolean(safeString(options.endpoint || input.endpoint).trim()),
        endpointHost: parseEndpointHost(options.endpoint || input.endpoint),
      },
    });
  }

  return Object.freeze({
    getDescriptor() {
      return descriptor;
    },
    can(capability) {
      return capability === "invokeExternal";
    },
    async invokeExternal(input = {}, options = {}) {
      const endpoint = safeString(options.endpoint || input.endpoint).trim();
      const endpointURL = parseEndpointURL(endpoint);
      const requestPreview = buildAIRequestPreview(input, {
        ...options,
        capability: "invokeExternal",
        consumer: options.consumer || "customExternalAPI",
        endpoint,
        networkAllowed: options.networkPolicy === "allow-network",
      });

      if (options.networkPolicy !== "allow-network") {
        return unavailable("network-disabled", input, { ...options, endpoint });
      }
      if (!endpoint) {
        return unavailable("endpoint-missing", input, { ...options, endpoint });
      }
      if (!endpointURL) {
        return unavailable("invalid-endpoint", input, { ...options, endpoint });
      }

      const fetcher = fetchImpl || globalThis.fetch;
      if (typeof fetcher !== "function") {
        return unavailable("fetch-unavailable", input, { ...options, endpoint });
      }

      const request = options.request && typeof options.request === "object"
        ? options.request
        : buildDefaultExternalRequest(input, {
          ...options,
          endpoint,
        });
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      let timeoutID = null;
      try {
        const timeoutPromise = new Promise((resolve) => {
          timeoutID = setTimeout(() => {
            try {
              controller?.abort?.();
            } catch {}
            resolve({ timeout: true });
          }, effectiveTimeoutMs);
        });
        const fetchPromise = Promise.resolve(fetcher(endpointURL.href, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json, text/plain;q=0.9, */*;q=0.5",
          },
          body: JSON.stringify(request),
          signal: controller?.signal,
        }));
        const response = await Promise.race([fetchPromise, timeoutPromise]);
        if (response?.timeout) {
          logger?.warn?.("aiProvider.customExternal.timeout", {
            endpointHost: endpointURL.host,
            timeoutMs: effectiveTimeoutMs,
          });
          return normalizeAIProviderResult({
            ok: false,
            status: "error",
            providerID: descriptor.id,
            capability: "invokeExternal",
            reason: "timeout",
            networkUsed: false,
            mock: false,
            requestPreview,
            response: {
              endpointHost: endpointURL.host,
              timeoutMs: effectiveTimeoutMs,
            },
            error: "timeout",
          });
        }

        const { bodyText, parsedJSON } = await readResponsePreview(response);
        const responsePreview = bodyText.slice(0, 4000);
        return normalizeAIProviderResult({
          ok: response?.ok === true,
          status: response?.ok === true ? "success" : "error",
          providerID: descriptor.id,
          capability: "invokeExternal",
          reason: response?.ok === true ? "" : `http-${Number(response?.status || 0) || "error"}`,
          networkUsed: true,
          mock: false,
          httpStatus: Number(response?.status || 0) || null,
          requestPreview,
          response: {
            endpointHost: endpointURL.host,
            json: parsedJSON,
            text: parsedJSON ? "" : responsePreview,
          },
          responsePreview,
        });
      } catch (error) {
        logger?.warn?.("aiProvider.customExternal.fetch.failed", {
          endpointHost: endpointURL.host,
          error: error?.message || String(error),
        });
        return normalizeAIProviderResult({
          ok: false,
          status: "error",
          providerID: descriptor.id,
          capability: "invokeExternal",
          reason: "fetch-error",
          networkUsed: false,
          mock: false,
          requestPreview,
          response: {
            endpointHost: endpointURL.host,
          },
          error: error?.message || String(error),
        });
      } finally {
        if (timeoutID !== null) {
          clearTimeout(timeoutID);
        }
      }
    },
    testConnection(input = {}, options = {}) {
      return this.invokeExternal(input, options);
    },
  });
}

export function createAIProviderRegistry({ logger } = {}) {
  const providers = new Map();

  function register(provider) {
    if (!provider || typeof provider.getDescriptor !== "function") {
      return false;
    }
    const descriptor = normalizeProviderDescriptor(provider.getDescriptor());
    providers.set(descriptor.id, provider);
    return true;
  }

  register(createNoNetworkAIProvider({ logger }));
  register(createCustomExternalAPIProvider({ logger }));

  return Object.freeze({
    registerProvider: register,
    getProvider(providerID = DEFAULT_PROVIDER_ID) {
      return providers.get(safeString(providerID).trim() || DEFAULT_PROVIDER_ID) || null;
    },
    listProviders() {
      return Array.from(providers.values()).map((provider) => normalizeProviderDescriptor(provider.getDescriptor()));
    },
    resolveProvider(capability, providerID = DEFAULT_PROVIDER_ID) {
      const requestedCapability = normalizeCapability(capability);
      const provider = this.getProvider(providerID);
      if (!requestedCapability || !provider?.can?.(requestedCapability)) {
        return null;
      }
      return provider;
    },
  });
}

export function resolveAIProviderContract({
  prefs,
  requestedCapability,
  networkPolicy = "no-network",
  registry = null,
  logger = null,
} = {}) {
  const capability = normalizeCapability(requestedCapability);
  const providerRegistry = registry || createAIProviderRegistry({ logger, prefs });
  const networkAllowed = networkPolicy === "allow-network";
  const endpoint = readPref(prefs, "customExternalAPI.endpoint", "");
  const endpointConfigured = Boolean(safeString(endpoint).trim());
  const endpointURL = parseEndpointURL(endpoint);
  const customExternalEnabled = readBoolPref(prefs, "customExternalAPI.enabled", false);
  const providerID = capability === "invokeExternal" && networkAllowed && customExternalEnabled && endpointConfigured
    ? CUSTOM_EXTERNAL_PROVIDER_ID
    : DEFAULT_PROVIDER_ID;
  const provider = capability ? providerRegistry.resolveProvider(capability, providerID) : null;
  const descriptor = provider ? normalizeProviderDescriptor(provider.getDescriptor()) : null;

  if (!capability) {
    return Object.freeze({
      available: false,
      canInvoke: false,
      status: "unsupported-capability",
      reason: "unsupported-capability",
      requestedCapability: safeString(requestedCapability),
      providerID: null,
      descriptor: null,
      networkAllowed,
      endpointConfigured,
      provider: null,
    });
  }

  if (capability === "invokeExternal") {
    let status = "network-disabled";
    let reason = "network-disabled";
    if (networkAllowed && !customExternalEnabled) {
      status = "disabled";
      reason = "pref-disabled";
    } else if (networkAllowed && !endpointConfigured) {
      status = "unavailable";
      reason = "endpoint-missing";
    } else if (networkAllowed && !endpointURL) {
      status = "unavailable";
      reason = "invalid-endpoint";
    }

    if (!(networkAllowed && customExternalEnabled && endpointConfigured && endpointURL)) {
      return Object.freeze({
        available: false,
        canInvoke: false,
        status,
        reason,
        requestedCapability: capability,
        providerID: descriptor?.id || DEFAULT_PROVIDER_ID,
        descriptor,
        networkAllowed,
        endpointConfigured,
        provider,
        buildPreview(input = {}, options = {}) {
          return buildAIRequestPreview(input, {
            ...options,
            capability,
            endpoint: options.endpoint ?? endpoint,
            networkAllowed,
          });
        },
        invoke(input = {}, options = {}) {
          return provider?.invokeExternal?.(input, {
            ...options,
            endpoint: options.endpoint ?? endpoint,
            networkPolicy,
          }) || normalizeAIProviderResult({
            ok: false,
            status,
            providerID: descriptor?.id || DEFAULT_PROVIDER_ID,
            capability,
            reason,
          });
        },
      });
    }
  } else if (capability === "summarizeItem" && networkAllowed) {
    return Object.freeze({
      available: false,
      canInvoke: false,
      status: "network-disabled",
      reason: "network-disabled",
      requestedCapability: capability,
      providerID: descriptor?.id || DEFAULT_PROVIDER_ID,
      descriptor,
      networkAllowed: false,
      endpointConfigured,
      provider,
      buildPreview(input = {}, options = {}) {
        return buildAIRequestPreview(input, {
          ...options,
          capability,
          endpoint: options.endpoint ?? endpoint,
          networkAllowed: false,
        });
      },
      invoke(input = {}, options = {}) {
        return provider?.summarizeItem?.(input, {
          ...options,
          endpoint: options.endpoint ?? endpoint,
        }) || normalizeAIProviderResult({
          ok: false,
          status: "unavailable",
          providerID: descriptor?.id || DEFAULT_PROVIDER_ID,
          capability,
          reason: "network-disabled",
        });
      },
    });
  }

  if (!provider || !descriptor) {
    return Object.freeze({
      available: false,
      canInvoke: false,
      status: "provider-unavailable",
      reason: "provider-unavailable",
      requestedCapability: capability,
      providerID: null,
      descriptor: null,
      networkAllowed,
      endpointConfigured,
      provider: null,
    });
  }

  const available = capability === "invokeExternal"
    ? networkAllowed && customExternalEnabled && endpointConfigured && Boolean(endpointURL)
    : false;
  const status = available ? "available" : "network-disabled";
  return Object.freeze({
    available,
    canInvoke: available,
    status,
    reason: available ? "" : "network-disabled",
    requestedCapability: capability,
    providerID: descriptor.id,
    descriptor,
    networkAllowed: available,
    endpointConfigured,
    provider,
    buildPreview(input = {}, options = {}) {
      return buildAIRequestPreview(input, {
        ...options,
        capability,
        endpoint: options.endpoint ?? endpoint,
        networkAllowed: available,
      });
    },
    invoke(input = {}, options = {}) {
      if (capability === "summarizeItem") {
        return provider.summarizeItem(input, {
          ...options,
          endpoint: options.endpoint ?? endpoint,
        });
      }
      if (capability === "invokeExternal") {
        return provider.invokeExternal(input, {
          ...options,
          endpoint: options.endpoint ?? endpoint,
          networkPolicy,
        });
      }
      return normalizeAIProviderResult({
        ok: false,
        status: "unsupported-capability",
        providerID: descriptor.id,
        capability,
        reason: "unsupported-capability",
      });
    },
  });
}
