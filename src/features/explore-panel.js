/**
 * 探索面板
 * 在 Item Pane 中添加一个探索 Section，展示条目的外部链接（DOI、Google Scholar、Semantic Scholar）
 */

const SECTION_ID = "toolsbox-explore-panel";
const OWNER = "toolsbox-explore-panel";
const PLUGIN_ID = "toolsbox@orlandozh.github";
const PREF_ENABLED = "explorePanel.enabled";

function getField(item, field) {
  if (!item) {
    return "";
  }
  try {
    if (typeof item.getField === "function") {
      return item.getField(field) || "";
    }
  } catch {}
  return item?.[field] || "";
}

function normalizeText(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function getItemID(item) {
  return item?.id ?? item?.itemID ?? null;
}

function createElement(doc, tagName, className, textContent = "") {
  const node = doc.createElement(tagName);
  if (className) {
    try {
      node.className = className;
    } catch {}
    if (node.setAttribute) {
      node.setAttribute("class", className);
    }
  }
  if (textContent) {
    node.textContent = textContent;
  }
  if (node.setAttribute) {
    node.setAttribute("data-toolsbox-owner", OWNER);
  }
  return node;
}

function removeOwnedChildren(body) {
  if (!body || typeof body.querySelectorAll !== "function") {
    return;
  }
  const ownedChildren = Array.from(body.querySelectorAll(`[data-toolsbox-owner="${OWNER}"]`));
  for (const child of ownedChildren) {
    if (typeof child.remove === "function") {
      child.remove();
    }
  }
}

function buildExploreLinks(item) {
  const links = [];

  const doi = normalizeText(getField(item, "DOI"));
  if (doi) {
    const cleanDoi = doi.replace(/^doi:\s*/i, "").replace(/^https?:\/\/doi\.org\//i, "");
    links.push({
      label: "DOI",
      url: `https://doi.org/${cleanDoi}`,
      icon: "🔗",
    });
  }

  const title = normalizeText(getField(item, "title"));
  if (title) {
    links.push({
      label: "Google Scholar",
      url: `https://scholar.google.com/scholar?q=${encodeURIComponent(title)}`,
      icon: "📚",
    });
    links.push({
      label: "Semantic Scholar",
      url: `https://www.semanticscholar.org/search?q=${encodeURIComponent(title)}&sort=relevance`,
      icon: "🧠",
    });
  }

  const isbn = normalizeText(getField(item, "ISBN"));
  if (isbn) {
    links.push({
      label: "OpenLibrary",
      url: `https://openlibrary.org/search?q=${encodeURIComponent(isbn)}`,
      icon: "📖",
    });
  }

  return links;
}

function renderExplorePanel({ doc, body, item } = {}) {
  if (!doc || typeof doc.createElement !== "function" || !body || typeof body.appendChild !== "function") {
    return null;
  }

  removeOwnedChildren(body);

  const root = createElement(doc, "div", "toolsbox-explore-panel");
  const links = buildExploreLinks(item);

  if (links.length === 0) {
    const empty = createElement(doc, "div", "toolsbox-explore-panel-empty", "No explore links available for this item.");
    root.appendChild(empty);
    body.appendChild(root);
    return root;
  }

  const list = createElement(doc, "div", "toolsbox-explore-panel-list");

  for (const link of links) {
    const entry = createElement(doc, "a", "toolsbox-explore-panel-link");
    entry.href = link.url;
    entry.target = "_blank";
    entry.rel = "noopener noreferrer";
    entry.textContent = `${link.icon} ${link.label}`;
    entry.title = link.url;

    // Style as badge
    entry.style.display = "inline-block";
    entry.style.margin = "4px 4px 4px 0";
    entry.style.padding = "4px 8px";
    entry.style.borderRadius = "4px";
    entry.style.backgroundColor = "var(--material-toolbar, #e0e0e0)";
    entry.style.color = "var(--material-text, #333)";
    entry.style.textDecoration = "none";
    entry.style.fontSize = "12px";

    list.appendChild(entry);
  }

  root.appendChild(list);
  body.appendChild(root);
  return root;
}

export function createExplorePanel(options) {
  const {
    logger,
    zotero,
    itemPane,
    prefs,
  } = options;
  const Zotero = zotero || globalThis.Zotero;

  let registered = false;
  let registeredPaneID = null;
  let renderGeneration = 0;

  function debug(message, details) {
    if (logger && typeof logger.debug === "function") {
      logger.debug(message, details);
    }
  }

  function warn(message, details) {
    if (logger && typeof logger.warn === "function") {
      logger.warn(message, details);
    }
  }

  function isEnabled() {
    if (!prefs || typeof prefs.get !== "function") {
      return false;
    }
    try {
      return prefs.get(PREF_ENABLED) === true;
    } catch {
      return false;
    }
  }

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
        l10nID: "toolsbox-section-explore-panel",
        icon: "content/icons/icon-48.png",
      },
      sidenav: {
        l10nID: "toolsbox-section-explore-panel",
        icon: "content/icons/icon-48.png",
        orderable: true,
      },
      bodyXHTML: "",
      onItemChange({ item, setEnabled } = {}) {
        if (typeof setEnabled === "function") {
          setEnabled(Boolean(item));
        }
      },
      onRender({ doc, body, item: currentItem } = {}) {
        renderGeneration += 1;
        return renderExplorePanel({
          doc,
          body,
          item: currentItem,
        });
      },
    };
  }

  function register() {
    if (registered) {
      return true;
    }

    if (!isEnabled()) {
      warn("explorePanel.register.skipped", { reason: "pref disabled" });
      return false;
    }

    const registrar = getSectionRegistrar();
    if (!registrar) {
      warn("explorePanel.register.skipped", { reason: "ItemPane API not available" });
      return false;
    }

    const result = registrar.register(createSectionConfig());
    if (result === null || result === false) {
      warn("explorePanel.register.skipped", { reason: "ItemPane registration rejected" });
      return false;
    }

    registered = true;
    registeredPaneID = result || SECTION_ID;
    debug("explorePanel.registered", {
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
        warn("explorePanel.cleanup.unregister.failed", {
          error: error?.message || String(error),
        });
      }
    }

    registered = false;
    registeredPaneID = null;
    debug("explorePanel.cleanedUp");
    return {
      stopped: true,
      resources: ["item-pane-section"],
    };
  }

  return {
    register,
    cleanup,
    destroy: cleanup,
    render: (renderOptions = {}) => renderExplorePanel(renderOptions),
    sectionID: SECTION_ID,
  };
}
