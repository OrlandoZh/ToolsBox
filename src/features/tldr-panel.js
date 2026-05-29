import {
  createAIProviderRegistry,
  resolveAIProviderContract,
} from "../services/ai-provider-contract.js";

const DEFAULT_LIMIT = 160;
const SECTION_ID = "toolsbox-tldr-panel";
const OWNER = "toolsbox-tldr-panel";
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
  const roots = Array.from(body.querySelectorAll(`.toolsbox-tldr-panel[data-toolsbox-owner="${OWNER}"]`));
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

export function collectTLDRInputForItem(itemRef, zotero = {}, options = {}) {
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
      hasAbstract: false,
      abstractLength: 0,
      abstractPreview: "",
    });
  }

  const limit = resolveLimit(options);
  const title = getItemTitle(item);
  const abstract = getAbstract(item);
  const itemType = getItemType(item);
  const reason = title || abstract || itemType ? null : "metadata-unavailable";

  return Object.freeze({
    reason,
    item,
    itemID: getItemID(item),
    key: normalizeText(item.key || getField(item, "key")),
    title: title || "Untitled item",
    itemType,
    abstract,
    hasAbstract: abstract.length > 0,
    abstractLength: abstract.length,
    abstractPreview: limit > 0 ? abstract.slice(0, limit) : "",
  });
}

export function buildTLDRPreviewPayload(input, options = {}) {
  const normalizedInput = input?.reason !== undefined
    ? input
    : collectTLDRInputForItem(input, options.zotero, options);
  if (!normalizedInput || normalizedInput.reason === "no-item") {
    return Object.freeze({
      reason: "no-item",
      input: normalizedInput || null,
      contract: null,
      requestPreview: null,
      result: null,
      networkUsed: false,
    });
  }

  const contract = options.providerContract || resolveAIProviderContract({
    prefs: options.prefs,
    requestedCapability: "summarizeItem",
    networkPolicy: "no-network",
    registry: options.providerRegistry || createAIProviderRegistry({ logger: options.logger }),
    logger: options.logger,
  });
  const requestInput = {
    title: normalizedInput.title,
    abstract: normalizedInput.abstract,
    itemType: normalizedInput.itemType,
  };
  const requestPreview = typeof contract?.buildPreview === "function"
    ? contract.buildPreview(requestInput, { consumer: "tldrPanel" })
    : null;
  const result = typeof contract?.invoke === "function"
    ? contract.invoke(requestInput, { consumer: "tldrPanel" })
    : null;

  return Object.freeze({
    reason: normalizedInput.reason || contract?.reason || contract?.status || null,
    input: normalizedInput,
    contract: contract ? Object.freeze({
      status: contract.status,
      reason: contract.reason,
      providerID: contract.providerID,
      networkAllowed: contract.networkAllowed,
      requestedCapability: contract.requestedCapability,
    }) : null,
    requestPreview,
    result,
    networkUsed: Boolean(result?.networkUsed),
  });
}

export function renderTLDRPanelSection(options = {}) {
  const {
    doc,
    body,
    item,
    zotero,
    i18n,
    prefs,
    providerRegistry,
    providerContract,
    limit = DEFAULT_LIMIT,
    loading = false,
    payload = null,
  } = options;
  if (!doc || !body || typeof doc.createElement !== "function") {
    return null;
  }

  removeExistingOwnerRoots(body);

  const root = createOwnedElement(doc, "section", "toolsbox-tldr-panel");
  root.setAttribute?.("data-toolsbox-tldr-status", loading ? "loading" : "ready");
  appendTextElement(doc, root, "h3", "toolsbox-tldr-panel-title", translate(i18n, "toolsbox-section-tldr", "TLDR"));

  if (loading && item) {
    appendTextElement(doc, root, "p", "toolsbox-tldr-panel-loading", translate(i18n, "toolsbox-tldr-loading", "Preparing local TLDR preview..."));
    body.appendChild(root);
    return root;
  }

  const resolvedPayload = payload || buildTLDRPreviewPayload(
    collectTLDRInputForItem(item, zotero, { limit }),
    { prefs, providerRegistry, providerContract, limit },
  );

  if (resolvedPayload.reason === "no-item") {
    appendTextElement(doc, root, "p", "toolsbox-tldr-panel-empty", translate(i18n, "toolsbox-tldr-no-item", "No item selected"));
    body.appendChild(root);
    return root;
  }

  const input = resolvedPayload.input || {};
  root.setAttribute?.("data-toolsbox-tldr-provider-id", resolvedPayload.contract?.providerID || "");
  root.setAttribute?.("data-toolsbox-tldr-network-used", String(Boolean(resolvedPayload.networkUsed)));
  root.setAttribute?.("data-toolsbox-tldr-result-status", resolvedPayload.result?.status || resolvedPayload.contract?.status || "unavailable");

  appendTextElement(doc, root, "p", "toolsbox-tldr-panel-item-title", input.title || "Untitled item");
  if (input.itemType) {
    appendTextElement(doc, root, "p", "toolsbox-tldr-panel-item-type", `${translate(i18n, "toolsbox-tldr-item-type", "Item type")}: ${input.itemType}`);
  }
  appendTextElement(
    doc,
    root,
    "p",
    "toolsbox-tldr-panel-abstract-state",
    input.hasAbstract
      ? `${translate(i18n, "toolsbox-tldr-abstract-length", "Abstract length")}: ${input.abstractLength}`
      : translate(i18n, "toolsbox-tldr-empty-abstract", "No abstract available"),
  );
  if (input.abstractPreview) {
    appendTextElement(doc, root, "blockquote", "toolsbox-tldr-panel-abstract-preview", input.abstractPreview);
  }

  const requestPreview = resolvedPayload.requestPreview;
  if (requestPreview) {
    appendTextElement(
      doc,
      root,
      "p",
      "toolsbox-tldr-panel-request-preview",
      `${translate(i18n, "toolsbox-tldr-request-preview", "Request preview")}: ${requestPreview.contentFields.join(", ") || "metadata-only"}`,
    );
  }

  const statusText = resolvedPayload.result?.reason || resolvedPayload.contract?.reason || "network-disabled";
  appendTextElement(
    doc,
    root,
    "p",
    "toolsbox-tldr-panel-provider-status",
    `${translate(i18n, "toolsbox-tldr-provider-unavailable", "Provider unavailable")}: ${statusText}`,
  );
  if (resolvedPayload.result?.summary) {
    appendTextElement(doc, root, "p", "toolsbox-tldr-panel-summary-preview", resolvedPayload.result.summary);
  }

  body.appendChild(root);
  return root;
}

async function hydrateItemForTLDRRead(item, zotero = {}) {
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

export function createTLDRPanel(options = {}) {
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
        l10nID: "toolsbox-section-tldr",
        icon: "content/icons/icon-48.png",
      },
      sidenav: {
        l10nID: "toolsbox-section-tldr",
        icon: "content/icons/icon-48.png",
        orderable: true,
      },
      label: translate(i18n, "toolsbox-section-tldr", "TLDR"),
      bodyXHTML: "",
      onItemChange({ item: currentItem, setEnabled } = {}) {
        if (typeof setEnabled === "function") {
          setEnabled(Boolean(currentItem));
        }
      },
      onRender({ doc, body, item: currentItem } = {}) {
        renderGeneration += 1;
        return renderTLDRPanelSection({
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
        const hydratedItem = await hydrateItemForTLDRRead(currentItem, Zotero);
        if (generation !== renderGeneration || getItemID(hydratedItem) !== getItemID(currentItem)) {
          return null;
        }
        return renderTLDRPanelSection({
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
      logger?.warn?.("tldrPanel.register.skipped", { reason: "ItemPane API not available" });
      return false;
    }

    const result = registrar.register(createSectionConfig());
    if (result === null || result === false) {
      logger?.warn?.("tldrPanel.register.skipped", { reason: "ItemPane registration rejected" });
      return false;
    }

    registered = true;
    registeredPaneID = result || SECTION_ID;
    logger?.debug?.("tldrPanel.registered", {
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
        logger?.warn?.("tldrPanel.cleanup.unregister.failed", {
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
    collectTLDRInputForItem: (item, collectOptions = {}) => (
      collectTLDRInputForItem(item, Zotero, { limit, ...collectOptions })
    ),
    buildTLDRPreviewPayload: (input, payloadOptions = {}) => buildTLDRPreviewPayload(input, {
      prefs,
      providerRegistry: registry,
      logger,
      limit,
      ...payloadOptions,
    }),
    render: (renderOptions = {}) => renderTLDRPanelSection({
      ...renderOptions,
      zotero: Zotero,
      i18n,
      prefs,
      providerRegistry: registry,
      limit,
    }),
  };
}
