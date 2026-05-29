import {
  buildAIRequestPreview,
  createAIProviderRegistry,
  resolveAIProviderContract,
} from "../services/ai-provider-contract.js";

const DEFAULT_LIMIT = 160;
const SECTION_ID = "toolsbox-custom-external-api";
const OWNER = "toolsbox-custom-external-api";
const PLUGIN_ID = "toolsbox@orlandozh.github";

function safeCall(fn, thisArg, ...args) {
  if (typeof fn !== "function") {
    return undefined;
  }
  try {
    return fn.apply(thisArg, args);
  } catch {
    return undefined;
  }
}

function normalizeText(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function uniqueStrings(values) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => normalizeText(value))
    .filter(Boolean)));
}

function getField(item, field) {
  const direct = item?.[field];
  if (direct !== null && direct !== undefined && direct !== "") {
    return direct;
  }
  return safeCall(item?.getField, item, field);
}

function getItemID(item) {
  return item?.id ?? item?.itemID ?? null;
}

function resolveItem(ref, zotero = {}) {
  if (!ref) {
    return null;
  }
  if (typeof ref === "object") {
    return ref;
  }
  return safeCall(zotero?.Items?.get, zotero.Items, ref) || null;
}

function resolveLimit(options = {}) {
  return Number.isFinite(options.limit) && options.limit >= 0
    ? Math.floor(options.limit)
    : DEFAULT_LIMIT;
}

function translate(i18n, key, fallback) {
  if (typeof i18n?.t === "function") {
    return i18n.t(key, fallback);
  }
  return fallback;
}

function readPref(prefs, key, fallback = "") {
  try {
    const value = typeof prefs?.get === "function" ? prefs.get(key) : undefined;
    return value === undefined || value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function getEndpointHost(endpoint) {
  try {
    return new URL(normalizeText(endpoint)).host || "";
  } catch {
    return "";
  }
}

function createOwnedElement(doc, tagName, className = "") {
  const element = doc.createElement(tagName);
  if (className) {
    element.className = className;
    element.setAttribute?.("class", className);
  }
  element.setAttribute?.("data-toolsbox-owner", OWNER);
  return element;
}

function appendTextElement(doc, parent, tagName, className, text) {
  const element = createOwnedElement(doc, tagName, className);
  element.textContent = normalizeText(text);
  parent.appendChild(element);
  return element;
}

function removeExistingOwnerRoots(body) {
  if (!body || typeof body.querySelectorAll !== "function") {
    return;
  }
  const roots = Array.from(body.querySelectorAll(`.toolsbox-custom-external-api[data-toolsbox-owner="${OWNER}"]`));
  for (const root of roots) {
    root.remove?.();
  }
}

function getItemTitle(item) {
  return normalizeText(getField(item, "title"))
    || normalizeText(item?.title)
    || (getItemID(item) ? `Item ${getItemID(item)}` : "");
}

function getItemType(item) {
  return normalizeText(item?.itemType)
    || normalizeText(getField(item, "itemType"))
    || normalizeText(item?.itemTypeID ? `type-${item.itemTypeID}` : "");
}

function getAbstract(item) {
  return normalizeText(getField(item, "abstractNote"))
    || normalizeText(getField(item, "abstract"));
}

function getDOI(item) {
  return normalizeText(getField(item, "DOI"))
    || normalizeText(getField(item, "doi"))
    || normalizeText(item?.DOI || item?.doi);
}

function getTags(item) {
  const rawTags = safeCall(item?.getTags, item) || item?.tags || [];
  return uniqueStrings(rawTags.map((tag) => tag?.tag || tag?.name || tag));
}

function responsePreviewText(result) {
  if (!result) {
    return "";
  }
  if (result.responsePreview) {
    return result.responsePreview;
  }
  if (result.response?.json) {
    return JSON.stringify(result.response.json);
  }
  return normalizeText(result.response?.text || "");
}

export function collectCustomExternalAPIInputForItem(itemRef, zotero = {}, options = {}) {
  const item = resolveItem(itemRef, zotero);
  if (!item) {
    return Object.freeze({
      reason: "no-item",
      item: null,
      itemID: null,
      key: "",
      title: "",
      itemType: "",
      abstract: "",
      doi: "",
      tags: Object.freeze([]),
      requestPreview: null,
    });
  }

  const limit = resolveLimit(options);
  const title = getItemTitle(item);
  const abstract = getAbstract(item);
  const itemType = getItemType(item);
  const doi = getDOI(item);
  const tags = getTags(item);
  const endpoint = normalizeText(options.endpoint);
  const input = {
    itemID: getItemID(item),
    key: normalizeText(item.key || getField(item, "key")),
    title: title || "Untitled item",
    itemType,
    abstract,
    doi,
    tags,
  };

  return Object.freeze({
    reason: title || abstract || itemType || doi || tags.length > 0 ? null : "metadata-unavailable",
    item,
    ...input,
    abstractPreview: limit > 0 ? abstract.slice(0, limit) : "",
    requestPreview: buildAIRequestPreview(input, {
      capability: "invokeExternal",
      consumer: "customExternalAPI",
      endpoint,
      maxPreviewLength: limit,
      networkAllowed: Boolean(endpoint),
    }),
  });
}

export function buildCustomExternalAPIRequest(input = {}, options = {}) {
  const endpoint = normalizeText(options.endpoint || input.endpoint);
  const requestPreview = buildAIRequestPreview(input, {
    capability: "invokeExternal",
    consumer: "customExternalAPI",
    endpoint,
    maxPreviewLength: resolveLimit(options),
    networkAllowed: true,
  });
  return Object.freeze({
    schemaVersion: 1,
    capability: "invokeExternal",
    consumer: "customExternalAPI",
    payload: Object.freeze({
      itemID: input.itemID ?? null,
      key: normalizeText(input.key),
      title: normalizeText(input.title),
      itemType: normalizeText(input.itemType),
      abstract: normalizeText(input.abstract),
      doi: normalizeText(input.doi),
      tags: Object.freeze(uniqueStrings(input.tags)),
      requestPreview,
    }),
  });
}

export async function invokeCustomExternalAPI(input = {}, options = {}) {
  const endpoint = normalizeText(options.endpoint || readPref(options.prefs, "customExternalAPI.endpoint", ""));
  const registry = options.providerRegistry || createAIProviderRegistry({
    logger: options.logger,
    prefs: options.prefs,
  });
  const contract = options.providerContract || resolveAIProviderContract({
    prefs: options.prefs,
    requestedCapability: "invokeExternal",
    networkPolicy: "allow-network",
    registry,
    logger: options.logger,
  });
  const request = buildCustomExternalAPIRequest(input, {
    endpoint,
    limit: options.limit,
  });
  if (!contract?.canInvoke || typeof contract.invoke !== "function") {
    return {
      contract,
      request,
      result: {
        ok: false,
        status: contract?.status || "unavailable",
        reason: contract?.reason || "unavailable",
        networkUsed: false,
        responsePreview: "",
        response: null,
      },
    };
  }

  const result = await contract.invoke(input, {
    consumer: "customExternalAPI",
    endpoint,
    networkPolicy: "allow-network",
    request,
  });
  return {
    contract,
    request,
    result,
  };
}

export function renderCustomExternalAPISection(options = {}) {
  const {
    doc,
    body,
    item,
    zotero,
    i18n,
    prefs,
    providerRegistry,
    providerContract,
    endpoint = readPref(prefs, "customExternalAPI.endpoint", ""),
    limit = DEFAULT_LIMIT,
    loading = false,
    result = null,
    onRun = null,
  } = options;
  if (!doc || !body || typeof doc.createElement !== "function") {
    return null;
  }

  removeExistingOwnerRoots(body);

  const root = createOwnedElement(doc, "section", "toolsbox-custom-external-api");
  root.setAttribute?.("data-toolsbox-custom-external-api-status", loading ? "loading" : "ready");
  root.setAttribute?.("data-toolsbox-custom-external-api-network-used", String(Boolean(result?.networkUsed)));
  root.setAttribute?.("data-toolsbox-custom-external-api-result-status", result?.status || "idle");
  appendTextElement(doc, root, "h3", "toolsbox-custom-external-api-title", translate(i18n, "toolsbox-section-custom-external-api", "Custom External API"));

  if (loading && item) {
    appendTextElement(doc, root, "p", "toolsbox-custom-external-api-loading", translate(i18n, "toolsbox-custom-external-api-loading", "Preparing local request preview..."));
    body.appendChild(root);
    return root;
  }

  const input = collectCustomExternalAPIInputForItem(item, zotero, {
    endpoint,
    limit,
  });
  if (input.reason === "no-item") {
    appendTextElement(doc, root, "p", "toolsbox-custom-external-api-empty", translate(i18n, "toolsbox-custom-external-api-no-item", "No item selected"));
    body.appendChild(root);
    return root;
  }

  const host = getEndpointHost(endpoint);
  root.setAttribute?.("data-toolsbox-custom-external-api-endpoint-host", host);
  appendTextElement(doc, root, "p", "toolsbox-custom-external-api-item-title", input.title || "Untitled item");
  if (input.itemType) {
    appendTextElement(doc, root, "p", "toolsbox-custom-external-api-item-type", `${translate(i18n, "toolsbox-custom-external-api-item-type", "Item type")}: ${input.itemType}`);
  }
  if (input.doi) {
    appendTextElement(doc, root, "p", "toolsbox-custom-external-api-doi", `DOI: ${input.doi}`);
  }
  appendTextElement(
    doc,
    root,
    "p",
    "toolsbox-custom-external-api-endpoint",
    host
      ? `${translate(i18n, "toolsbox-custom-external-api-endpoint", "Endpoint")}: ${host}`
      : translate(i18n, "toolsbox-custom-external-api-endpoint-missing", "Endpoint missing"),
  );
  appendTextElement(
    doc,
    root,
    "p",
    "toolsbox-custom-external-api-request-preview",
    `${translate(i18n, "toolsbox-custom-external-api-request-preview", "Request preview")}: ${(input.requestPreview?.contentFields || []).join(", ") || "metadata-only"}`,
  );
  if (input.abstractPreview) {
    appendTextElement(doc, root, "blockquote", "toolsbox-custom-external-api-abstract-preview", input.abstractPreview);
  }
  if (input.tags.length > 0) {
    appendTextElement(doc, root, "p", "toolsbox-custom-external-api-tags", `${translate(i18n, "toolsbox-custom-external-api-tags", "Tags")}: ${input.tags.join(", ")}`);
  }

  const button = createOwnedElement(doc, "button", "toolsbox-custom-external-api-run-button");
  button.textContent = translate(i18n, "toolsbox-custom-external-api-run", "Run");
  button.disabled = !host;
  button.setAttribute?.("type", "button");
  const runHandler = async () => {
    if (button.disabled) {
      return;
    }
    button.disabled = true;
    root.setAttribute?.("data-toolsbox-custom-external-api-status", "running");
    const statusNode = root.querySelector?.(".toolsbox-custom-external-api-status");
    if (statusNode) {
      statusNode.textContent = translate(i18n, "toolsbox-custom-external-api-running", "Running request...");
    }
    try {
      const invocation = typeof onRun === "function"
        ? await onRun(input)
        : await invokeCustomExternalAPI(input, {
          prefs,
          providerRegistry,
          providerContract,
          endpoint,
          limit,
        });
      const invokeResult = invocation?.result || invocation;
      renderCustomExternalAPISection({
        ...options,
        loading: false,
        result: invokeResult,
        onRun,
      });
    } catch (error) {
      renderCustomExternalAPISection({
        ...options,
        loading: false,
        result: {
          ok: false,
          status: "error",
          reason: "render-error",
          networkUsed: false,
          responsePreview: error?.message || String(error),
        },
        onRun,
      });
    }
  };
  button.addEventListener?.("click", runHandler);
  button.__toolsboxRun = runHandler;
  root.appendChild(button);

  appendTextElement(
    doc,
    root,
    "p",
    "toolsbox-custom-external-api-status",
    result
      ? `${translate(i18n, "toolsbox-custom-external-api-result", "Result")}: ${result.status || "unknown"} ${result.httpStatus || ""}`.trim()
      : translate(i18n, "toolsbox-custom-external-api-idle", "Ready to send one explicit request"),
  );
  const preview = responsePreviewText(result);
  if (preview) {
    appendTextElement(doc, root, "pre", "toolsbox-custom-external-api-response-preview", preview);
  } else if (result?.reason) {
    appendTextElement(doc, root, "p", "toolsbox-custom-external-api-response-preview", result.reason);
  }

  body.appendChild(root);
  return root;
}

async function hydrateItemForExternalAPIRead(item, zotero = {}) {
  const itemID = getItemID(item);
  if (!itemID || typeof zotero?.Items?.getAsync !== "function") {
    return item;
  }
  try {
    return await zotero.Items.getAsync(itemID) || item;
  } catch {
    return item;
  }
}

export function createCustomExternalAPI(options = {}) {
  const {
    logger,
    i18n,
    zotero,
    itemPane,
    prefs,
    providerRegistry,
    limit = DEFAULT_LIMIT,
  } = options;
  const Zotero = zotero || globalThis.Zotero;
  const registry = providerRegistry || createAIProviderRegistry({ logger, prefs });
  let registered = false;
  let registeredPaneID = null;
  let renderGeneration = 0;

  function getSectionRegistrar() {
    if (
      itemPane
      && typeof itemPane.registerSection === "function"
      && (typeof itemPane.isAvailable !== "function" || itemPane.isAvailable())
    ) {
      return {
        register: (config) => itemPane.registerSection(config),
        unregister: (paneID) => itemPane.unregisterSection?.(paneID),
      };
    }

    if (Zotero?.ItemPaneManager && typeof Zotero.ItemPaneManager.registerSection === "function") {
      return {
        register: (config) => Zotero.ItemPaneManager.registerSection(config),
        unregister: (paneID) => Zotero.ItemPaneManager.unregisterSection?.(paneID),
      };
    }

    return null;
  }

  function createSectionConfig() {
    return {
      paneID: SECTION_ID,
      pluginID: PLUGIN_ID,
      header: {
        l10nID: "toolsbox-section-custom-external-api",
        icon: "content/icons/icon-48.png",
      },
      sidenav: {
        l10nID: "toolsbox-section-custom-external-api",
        icon: "content/icons/icon-48.png",
        orderable: true,
      },
      label: translate(i18n, "toolsbox-section-custom-external-api", "Custom External API"),
      bodyXHTML: "",
      onItemChange({ item: currentItem, setEnabled } = {}) {
        if (typeof setEnabled === "function") {
          setEnabled(Boolean(currentItem));
        }
      },
      onRender({ doc, body, item: currentItem } = {}) {
        renderGeneration += 1;
        return renderCustomExternalAPISection({
          doc,
          body,
          item: currentItem,
          zotero: Zotero,
          i18n,
          prefs,
          providerRegistry: registry,
          limit,
          loading: Boolean(currentItem),
        });
      },
      async onAsyncRender({ doc, body, item: currentItem } = {}) {
        const generation = renderGeneration;
        const hydratedItem = await hydrateItemForExternalAPIRead(currentItem, Zotero);
        if (generation !== renderGeneration || getItemID(hydratedItem) !== getItemID(currentItem)) {
          return null;
        }
        return renderCustomExternalAPISection({
          doc,
          body,
          item: hydratedItem,
          zotero: Zotero,
          i18n,
          prefs,
          providerRegistry: registry,
          limit,
        });
      },
    };
  }

  function register() {
    if (registered) {
      return true;
    }

    const registrar = getSectionRegistrar();
    if (!registrar) {
      logger?.warn?.("customExternalAPI.register.skipped", { reason: "ItemPane API not available" });
      return false;
    }

    const result = registrar.register(createSectionConfig());
    if (result === null || result === false) {
      logger?.warn?.("customExternalAPI.register.skipped", { reason: "ItemPane registration rejected" });
      return false;
    }

    registered = true;
    registeredPaneID = result || SECTION_ID;
    logger?.debug?.("customExternalAPI.registered", {
      sectionID: SECTION_ID,
      registeredPaneID,
    });
    return true;
  }

  function cleanup() {
    if (!registered) {
      return {
        stopped: true,
        resources: [],
      };
    }

    const registrar = getSectionRegistrar();
    if (registrar && typeof registrar.unregister === "function") {
      try {
        registrar.unregister(registeredPaneID || SECTION_ID);
      } catch (error) {
        logger?.warn?.("customExternalAPI.cleanup.unregister.failed", {
          error: error?.message || String(error),
        });
      }
    }

    registered = false;
    registeredPaneID = null;
    return {
      stopped: true,
      resources: ["item-pane-section"],
    };
  }

  return {
    register,
    cleanup,
    destroy: cleanup,
    collectCustomExternalAPIInputForItem: (item, collectOptions = {}) => (
      collectCustomExternalAPIInputForItem(item, Zotero, {
        endpoint: readPref(prefs, "customExternalAPI.endpoint", ""),
        limit,
        ...collectOptions,
      })
    ),
    buildCustomExternalAPIRequest: (input, requestOptions = {}) => buildCustomExternalAPIRequest(input, {
      endpoint: readPref(prefs, "customExternalAPI.endpoint", ""),
      limit,
      ...requestOptions,
    }),
    invoke: (input, invokeOptions = {}) => invokeCustomExternalAPI(input, {
      prefs,
      providerRegistry: registry,
      logger,
      endpoint: readPref(prefs, "customExternalAPI.endpoint", ""),
      limit,
      ...invokeOptions,
    }),
    render: (renderOptions = {}) => renderCustomExternalAPISection({
      ...renderOptions,
      zotero: Zotero,
      i18n,
      prefs,
      providerRegistry: registry,
      limit,
    }),
  };
}
