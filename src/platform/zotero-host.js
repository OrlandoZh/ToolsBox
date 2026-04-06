function createMenuElement(window) {
  if (typeof window.document.createXULElement === "function") {
    return window.document.createXULElement("menuitem");
  }
  return window.document.createElement("menuitem");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeActivationPolicy(value) {
  return value === "ui-required" ? "ui-required" : "host-first";
}

function toFiniteNumber(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function sanitizeCaptureToken(value, fallback = "surface") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function getElementCount(collection) {
  if (!collection) {
    return 0;
  }
  if (Number.isFinite(Number(collection.length))) {
    return Number(collection.length);
  }
  return 0;
}

function countSelectorMatches(root, selector) {
  if (!root || typeof root.querySelectorAll !== "function") {
    return 0;
  }
  try {
    return getElementCount(root.querySelectorAll(selector));
  }
  catch {
    return 0;
  }
}

function elementMatchesSelector(element, selector) {
  if (!element || typeof element.matches !== "function") {
    return false;
  }
  try {
    return element.matches(selector);
  }
  catch {
    return false;
  }
}

function safeQuery(root, selector) {
  if (!root || typeof root.querySelector !== "function") {
    return null;
  }
  try {
    return root.querySelector(selector);
  }
  catch {
    return null;
  }
}

function safeQueryAll(root, selector) {
  if (!root || typeof root.querySelectorAll !== "function") {
    return [];
  }
  try {
    return Array.from(root.querySelectorAll(selector) || []);
  }
  catch {
    return [];
  }
}

function readElementAttribute(element, names = []) {
  if (!element || typeof element.getAttribute !== "function") {
    return null;
  }
  for (const name of names) {
    try {
      const raw = element.getAttribute(name);
      if (typeof raw === "string" && raw.trim()) {
        return raw.trim();
      }
    }
    catch {}
  }
  return null;
}

function readElementBooleanState(element, names = []) {
  if (!element || typeof element.getAttribute !== "function") {
    return false;
  }
  for (const name of names) {
    try {
      const raw = element.getAttribute(name);
      if (raw === null) {
        continue;
      }
      if (raw === "" || raw === name || raw === "true") {
        return true;
      }
      if (raw === "false") {
        return false;
      }
      return true;
    }
    catch {}
  }
  return false;
}

function hasClassToken(element, token) {
  const className = readElementAttribute(element, ["class"]);
  if (!className || !token) {
    return false;
  }
  return className.split(/\s+/u).includes(token);
}

function collectUniqueElements(root, selectors = []) {
  const elements = [];
  const seen = new Set();

  const pushElement = (element) => {
    if (!element || seen.has(element)) {
      return;
    }
    seen.add(element);
    elements.push(element);
  };

  selectors.forEach((selector) => {
    if (elementMatchesSelector(root, selector)) {
      pushElement(root);
    }
    safeQueryAll(root, selector).forEach(pushElement);
  });

  return elements;
}

function resolvePreferenceInteractiveRoot(paneElement, pane = null) {
  if (!paneElement) {
    return {
      element: null,
      strategy: null,
    };
  }

  const paneID = String(pane?.id || readElementAttribute(paneElement, ["id"]) || "").trim() || null;
  const candidateRootID = paneID ? `${paneID}-root` : null;
  if (candidateRootID) {
    if (readElementAttribute(paneElement, ["id"]) === candidateRootID) {
      return {
        element: paneElement,
        strategy: "pane-root-id",
      };
    }
    const explicitRoot = safeQuery(paneElement, `#${candidateRootID}`);
    if (explicitRoot) {
      return {
        element: explicitRoot,
        strategy: "pane-root-id",
      };
    }
  }

  if (elementMatchesSelector(paneElement, "[data-pref-root]")) {
    return {
      element: paneElement,
      strategy: "data-pref-root",
    };
  }
  const dataPrefRoot = safeQuery(paneElement, "[data-pref-root]");
  if (dataPrefRoot) {
    return {
      element: dataPrefRoot,
      strategy: "data-pref-root",
    };
  }

  if (readElementAttribute(paneElement, ["data-active-tab"])) {
    return {
      element: paneElement,
      strategy: "active-tab-root",
    };
  }
  const activeTabRoot = safeQuery(paneElement, "[data-active-tab]");
  if (activeTabRoot) {
    return {
      element: activeTabRoot,
      strategy: "active-tab-root",
    };
  }

  return {
    element: paneElement,
    strategy: "pane-container",
  };
}

function resolvePreferenceSurfaceRoot(paneElement, pane = null) {
  if (!paneElement) {
    return {
      element: null,
      strategy: null,
    };
  }

  const interactiveRoot = resolvePreferenceInteractiveRoot(paneElement, pane);
  if (interactiveRoot.element && interactiveRoot.strategy && interactiveRoot.strategy !== "pane-container") {
    return interactiveRoot;
  }

  if (elementMatchesSelector(paneElement, ".cleanroom-pref-root")) {
    return {
      element: paneElement,
      strategy: "pane-root-class",
    };
  }

  const descendantRoot = safeQuery(paneElement, ".cleanroom-pref-root");
  if (descendantRoot) {
    return {
      element: descendantRoot,
      strategy: "descendant-root-class",
    };
  }

  const contentChildren = Array.from(paneElement?.children || []).filter((child) => {
    const localName = typeof child?.localName === "string"
      ? child.localName.trim().toLowerCase()
      : typeof child?.tagName === "string"
        ? child.tagName.trim().toLowerCase()
        : "";
    return localName && !["link", "script", "style"].includes(localName);
  });
  if (contentChildren.length === 1) {
    return {
      element: contentChildren[0],
      strategy: "single-content-child",
    };
  }

  return {
    element: paneElement,
    strategy: "pane-container",
  };
}

function readElementClientRectSnapshot(element) {
  if (!element || typeof element.getBoundingClientRect !== "function") {
    return null;
  }

  const rect = element.getBoundingClientRect();
  const left = toFiniteNumber(rect?.left);
  const top = toFiniteNumber(rect?.top);
  const width = toFiniteNumber(rect?.width);
  const height = toFiniteNumber(rect?.height);
  if ([left, top, width, height].some((value) => value === null)) {
    return null;
  }

  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function hasSameElementClientRect(leftRect, rightRect) {
  if (!leftRect || !rightRect) {
    return false;
  }

  return leftRect.left === rightRect.left
    && leftRect.top === rightRect.top
    && leftRect.width === rightRect.width
    && leftRect.height === rightRect.height;
}

async function settlePreferenceSurfaceGeometry(resolveSurface, options = {}) {
  const timeoutMs = Number.isFinite(Number(options.timeoutMs))
    ? Math.max(0, Number(options.timeoutMs))
    : 1200;
  const intervalMs = Number.isFinite(Number(options.intervalMs))
    ? Math.max(20, Number(options.intervalMs))
    : 50;
  const minObservationMs = Number.isFinite(Number(options.minObservationMs))
    ? Math.max(0, Number(options.minObservationMs))
    : 700;
  const quietWindowMs = Number.isFinite(Number(options.quietWindowMs))
    ? Math.max(0, Number(options.quietWindowMs))
    : 250;

  const startedAt = Date.now();
  let firstObservedAt = null;
  let lastChangeAt = null;
  let sampleCount = 0;
  let lastElement = null;
  let lastStrategy = null;
  let lastGeometry = null;

  while ((Date.now() - startedAt) <= timeoutMs) {
    const resolved = typeof resolveSurface === "function"
      ? resolveSurface() || {}
      : {};
    const element = resolved.element || null;
    const strategy = typeof resolved.strategy === "string" && resolved.strategy.trim()
      ? resolved.strategy.trim()
      : null;
    const geometry = readElementClientRectSnapshot(element);
    const now = Date.now();

    if (element && geometry && geometry.width > 0 && geometry.height > 0) {
      sampleCount += 1;
      if (firstObservedAt === null) {
        firstObservedAt = now;
        lastChangeAt = now;
      }

      const geometryChanged = element !== lastElement || !hasSameElementClientRect(geometry, lastGeometry);
      if (geometryChanged) {
        lastChangeAt = now;
      }

      lastElement = element;
      lastStrategy = strategy;
      lastGeometry = geometry;

      if (
        firstObservedAt !== null
        && lastChangeAt !== null
        && (now - firstObservedAt) >= minObservationMs
        && (now - lastChangeAt) >= quietWindowMs
      ) {
        return {
          stable: true,
          timedOut: false,
          observedMs: now - startedAt,
          sampleCount,
          strategy: lastStrategy,
          geometry: lastGeometry,
        };
      }
    }

    await sleep(intervalMs);
  }

  return {
    stable: false,
    timedOut: true,
    observedMs: Date.now() - startedAt,
    sampleCount,
    strategy: lastStrategy,
    geometry: lastGeometry,
  };
}

function collectPreferenceTabs(root) {
  return collectUniqueElements(root, [
    "[data-pref-tab]",
    "[data-tab-id]",
    "[role='tab']",
  ]);
}

function collectPreferencePanels(root) {
  return collectUniqueElements(root, [
    "[data-pref-panel]",
    "[data-tab-panel]",
    "[data-panel-id]",
    "[role='tabpanel']",
  ]);
}

function readPreferenceTabID(element) {
  return readElementAttribute(element, [
    "data-pref-tab",
    "data-tab-id",
    "data-tab",
    "id",
    "value",
  ]);
}

function readPreferencePanelID(element) {
  return readElementAttribute(element, [
    "data-pref-panel",
    "data-tab-panel",
    "data-panel-id",
    "id",
  ]);
}

function isVisiblePreferencePanel(element) {
  return !readElementBooleanState(element, [
    "hidden",
    "collapsed",
    "aria-hidden",
  ]) && !hasClassToken(element, "is-hidden");
}

function resolveActivePreferenceState(root) {
  const tabs = collectPreferenceTabs(root);
  const panels = collectPreferencePanels(root);
  const rootActiveTabID = readElementAttribute(root, ["data-active-tab"]);
  const activeTabElement = rootActiveTabID
    ? tabs.find((element) => readPreferenceTabID(element) === rootActiveTabID) || null
    : tabs.find((element) => {
      return readElementBooleanState(element, [
        "selected",
        "checked",
        "aria-selected",
      ]) || hasClassToken(element, "is-active") || hasClassToken(element, "active");
    }) || null;
  const activeTabID = rootActiveTabID || readPreferenceTabID(activeTabElement);
  const visiblePanels = panels.filter((element) => isVisiblePreferencePanel(element));

  let activePanelElement = null;
  const activeTabControls = readElementAttribute(activeTabElement, ["aria-controls"]);
  if (activeTabControls) {
    activePanelElement = panels.find((element) => readElementAttribute(element, ["id"]) === activeTabControls) || null;
  }
  if (!activePanelElement && activeTabID) {
    activePanelElement = panels.find((element) => {
      return [
        readPreferencePanelID(element),
        readElementAttribute(element, ["aria-labelledby"]),
      ].includes(activeTabID);
    }) || null;
  }
  if (!activePanelElement) {
    activePanelElement = panels.find((element) => {
      return readElementBooleanState(element, ["selected"]) || hasClassToken(element, "is-active") || hasClassToken(element, "active");
    }) || null;
  }
  if (!activePanelElement && visiblePanels.length === 1) {
    activePanelElement = visiblePanels[0];
  }

  return {
    tabs,
    panels,
    activeTabID: activeTabID || null,
    activePanelElement,
    activePanelID: readPreferencePanelID(activePanelElement),
    visiblePanelCount: visiblePanels.length,
  };
}

function inspectPreferencePaneSurface(paneElement, pane = null) {
  const rootTagName = typeof paneElement?.localName === "string" && paneElement.localName.trim()
    ? paneElement.localName.trim()
    : typeof paneElement?.tagName === "string" && paneElement.tagName.trim()
      ? paneElement.tagName.trim().toLowerCase()
      : null;
  const rootNamespaceURI = typeof paneElement?.namespaceURI === "string" && paneElement.namespaceURI.trim()
    ? paneElement.namespaceURI.trim()
    : null;
  const childElementCount = Number.isFinite(Number(paneElement?.childElementCount))
    ? Number(paneElement.childElementCount)
    : getElementCount(paneElement?.children);
  const groupboxCount = countSelectorMatches(paneElement, "groupbox");
  const headingCount = countSelectorMatches(
    paneElement,
    "caption, label[class*='header'], .header, html\\:h1, html\\:h2, html\\:h3, h1, h2, h3",
  );
  const descriptionCount = countSelectorMatches(
    paneElement,
    "description, html\\:p, p",
  );
  const coreControlCount = countSelectorMatches(
    paneElement,
    "button, checkbox, input, select, textarea, radio, menulist, toolbarbutton",
  );
  const preferenceBindingCount = countSelectorMatches(paneElement, "[preference]");
  const preferenceDefinitionCount = countSelectorMatches(paneElement, "preferences > preference");
  const localizationLinkCount = countSelectorMatches(
    paneElement,
    "html\\:link[rel='localization'], link[rel='localization'], linkset html\\:link[rel='localization'], linkset link[rel='localization']",
  );
  const scriptTagCount = countSelectorMatches(paneElement, "script, html\\:script");
  const registeredScriptCount = Array.isArray(pane?.scripts) ? pane.scripts.length : 0;
  const registeredStylesheetCount = Array.isArray(pane?.stylesheets) ? pane.stylesheets.length : 0;
  const hasInlineLoadHook = elementMatchesSelector(paneElement, "[onload]")
    || countSelectorMatches(paneElement, "[onload]") > 0;
  const hasLoadBridgeSignature = [
    hasInlineLoadHook,
    localizationLinkCount > 0,
    scriptTagCount > 0,
    registeredScriptCount > 0,
    registeredStylesheetCount > 0,
    preferenceBindingCount > 0,
    preferenceDefinitionCount > 0,
  ].some(Boolean);
  const interactiveRoot = resolvePreferenceInteractiveRoot(paneElement, pane);
  const interactiveRootElement = interactiveRoot.element;
  const interactiveRootTagName = typeof interactiveRootElement?.localName === "string" && interactiveRootElement.localName.trim()
    ? interactiveRootElement.localName.trim()
    : typeof interactiveRootElement?.tagName === "string" && interactiveRootElement.tagName.trim()
      ? interactiveRootElement.tagName.trim().toLowerCase()
      : null;
  const interactiveRootID = readElementAttribute(interactiveRootElement, ["id"]);
  const activePreferenceState = resolveActivePreferenceState(interactiveRootElement);
  const panelCoreControlCount = activePreferenceState.activePanelElement
    ? countSelectorMatches(
      activePreferenceState.activePanelElement,
      "button, checkbox, input, select, textarea, radio, menulist, toolbarbutton",
    )
    : 0;
  const tabCount = activePreferenceState.tabs.length;
  const panelCount = activePreferenceState.panels.length;
  const hasInteractiveRoot = Boolean(interactiveRootElement) && (
    interactiveRoot.strategy !== "pane-container"
    || tabCount > 0
    || panelCount > 0
  );

  return {
    rootTagName,
    rootNamespaceURI,
    childElementCount,
    groupboxCount,
    headingCount,
    descriptionCount,
    coreControlCount,
    preferenceBindingCount,
    preferenceDefinitionCount,
    localizationLinkCount,
    scriptTagCount,
    registeredScriptCount,
    registeredStylesheetCount,
    hasInlineLoadHook,
    hasLoadBridgeSignature,
    hasInteractiveRoot,
    interactiveRootStrategy: interactiveRoot.strategy,
    interactiveRootTagName,
    interactiveRootID,
    tabCount,
    panelCount,
    activeTabID: activePreferenceState.activeTabID,
    activePanelID: activePreferenceState.activePanelID,
    visiblePanelCount: activePreferenceState.visiblePanelCount,
    panelCoreControlCount,
  };
}

function hasMountedPreferencePaneContent(surface) {
  if (!surface || typeof surface !== "object") {
    return false;
  }

  return [
    surface.childElementCount,
    surface.groupboxCount,
    surface.headingCount,
    surface.descriptionCount,
    surface.coreControlCount,
    surface.preferenceBindingCount,
    surface.preferenceDefinitionCount,
    surface.localizationLinkCount,
    surface.scriptTagCount,
    surface.tabCount,
    surface.panelCount,
    surface.panelCoreControlCount,
  ].some((value) => Number(value) > 0);
}

function hasPreferencePaneStructure(surface) {
  if (!surface || typeof surface !== "object") {
    return false;
  }

  return [
    surface.groupboxCount,
    surface.headingCount,
    surface.descriptionCount,
    surface.coreControlCount,
    surface.panelCoreControlCount,
  ].some((value) => Number(value) > 0);
}

function hasPreferencePaneBehaviorSignature(surface) {
  if (!surface || typeof surface !== "object") {
    return false;
  }

  return [
    surface.coreControlCount,
    surface.preferenceBindingCount,
    surface.preferenceDefinitionCount,
    surface.localizationLinkCount,
    surface.scriptTagCount,
    surface.registeredScriptCount,
    surface.registeredStylesheetCount,
    surface.tabCount,
    surface.panelCount,
    surface.panelCoreControlCount,
  ].some((value) => Number(value) > 0)
    || surface.hasInlineLoadHook === true
    || surface.hasLoadBridgeSignature === true;
}

function hasReadyActivePreferencePanel(surface) {
  if (!surface || typeof surface !== "object") {
    return false;
  }

  const panelCount = Number(surface.panelCount) || 0;
  if (panelCount <= 0) {
    return true;
  }

  const visiblePanelCount = Number(surface.visiblePanelCount) || 0;
  const activePanelReady = Boolean(surface.activePanelID) || visiblePanelCount === 1;
  return activePanelReady && (Number(surface.panelCoreControlCount) || 0) > 0;
}

function isReadyPreferencePaneSurface(surface) {
  if (!hasMountedPreferencePaneContent(surface)) {
    return false;
  }
  if (!hasPreferencePaneStructure(surface)) {
    return false;
  }
  if (!hasPreferencePaneBehaviorSignature(surface)) {
    return false;
  }

  const tabCount = Number(surface?.tabCount) || 0;
  if (tabCount > 0 && !surface.activeTabID) {
    return false;
  }

  return hasReadyActivePreferencePanel(surface);
}

function hasMountedPaneContent(element) {
  if (!element || typeof element !== "object") {
    return false;
  }

  const childElementCount = Number.isFinite(Number(element.childElementCount))
    ? Number(element.childElementCount)
    : getElementCount(element.children);
  if (childElementCount > 0) {
    return true;
  }

  if (typeof element.querySelector === "function") {
    try {
      if (element.querySelector("*")) {
        return true;
      }
    }
    catch {}
  }

  const textContent = typeof element.textContent === "string"
    ? element.textContent.trim()
    : "";
  return textContent.length > 0;
}

export function createZoteroHost({ globalScope, rootURI = "" }) {
  const zotero = globalScope.Zotero;
  const services = globalScope.Services;
  const components = globalScope.Components || (typeof Components !== "undefined" ? Components : null);
  const normalizedRoot = rootURI || "";

  function isMainZoteroWindow(window) {
    if (!window || window.closed) {
      return false;
    }

    const doc = window.document;
    if (!doc || !doc.documentElement) {
      return false;
    }

    const windowType = doc.documentElement.getAttribute("windowtype") || "";
    if (windowType.includes("zotero")) {
      return true;
    }

    return Boolean(doc.getElementById("menu_ToolsPopup"));
  }

  function hostLog(message, details = {}) {
    if (zotero && typeof zotero.debug === "function") {
      zotero.debug(`${message} ${JSON.stringify(details)}`);
      return;
    }

    if (globalScope.console && typeof globalScope.console.log === "function") {
      globalScope.console.log(message, details);
    }
  }

  function showAlert(window, title, body) {
    if (services?.prompt?.alert) {
      services.prompt.alert(window || null, title, body);
      return;
    }

    if (window && typeof window.alert === "function") {
      window.alert(body);
    }
  }

  function addToolsMenuItem(window, { id, label, onCommand }) {
    const doc = window.document;
    const toolsPopup = doc.getElementById("menu_ToolsPopup");

    if (!toolsPopup) {
      return () => {};
    }

    const existed = doc.getElementById(id);
    if (existed) {
      existed.remove();
    }

    const menuitem = createMenuElement(window);
    menuitem.id = id;
    menuitem.setAttribute("label", label);
    menuitem.addEventListener("command", onCommand);
    toolsPopup.appendChild(menuitem);

    return () => {
      menuitem.removeEventListener("command", onCommand);
      if (menuitem.parentNode) {
        menuitem.parentNode.removeChild(menuitem);
      }
    };
  }

  function resolveContentUrl(relativePath) {
    if (!normalizedRoot) {
      return relativePath;
    }
    const trimmed = relativePath.replace(/^\//, "");
    return `${normalizedRoot}${trimmed}`;
  }

  function injectStyleSheet(window, { id, href }) {
    const doc = window.document;
    const existed = doc.getElementById(id);
    if (existed) {
      return () => {};
    }

    const link = doc.createElement("link");
    link.setAttribute("id", id);
    link.setAttribute("rel", "stylesheet");
    link.setAttribute("type", "text/css");
    link.setAttribute("href", href);
    doc.documentElement.appendChild(link);

    return () => {
      if (link.parentNode) {
        link.parentNode.removeChild(link);
      }
    };
  }

  function insertFTLIfNeeded(window, resourceId) {
    if (!window || !resourceId) {
      return false;
    }

    const target = window.MozXULElement;
    if (!target || typeof target.insertFTLIfNeeded !== "function") {
      return false;
    }

    target.insertFTLIfNeeded(resourceId);
    return true;
  }

  function listMainWindows() {
    if (zotero && typeof zotero.getMainWindows === "function") {
      try {
        return zotero.getMainWindows().filter((window) => isMainZoteroWindow(window));
      }
      catch {}
    }

    if (!services?.wm || typeof services.wm.getEnumerator !== "function") {
      return [];
    }

    const windows = [];
    const enumerator = services.wm.getEnumerator(null);
    while (enumerator && enumerator.hasMoreElements()) {
      const candidate = enumerator.getNext();
      if (isMainZoteroWindow(candidate)) {
        windows.push(candidate);
      }
    }

    return windows;
  }

  function listWindowsByType(windowType = null) {
    if (!services?.wm || typeof services.wm.getEnumerator !== "function") {
      return [];
    }

    const windows = [];
    const enumerator = services.wm.getEnumerator(windowType);
    while (enumerator && enumerator.hasMoreElements()) {
      const candidate = enumerator.getNext();
      if (candidate && !candidate.closed) {
        windows.push(candidate);
      }
    }
    return windows;
  }

  function listPreferenceWindows() {
    return listWindowsByType("zotero:pref");
  }

  function getPreferenceWindow() {
    return listPreferenceWindows()[0] || null;
  }

  function getMainWindow() {
    if (zotero && typeof zotero.getMainWindow === "function") {
      try {
        const window = zotero.getMainWindow();
        if (isMainZoteroWindow(window)) {
          return window;
        }
      } catch {}
    }

    return listMainWindows()[0] || null;
  }

  async function waitFor(condition, options = {}) {
    const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : 5000;
    const intervalMs = Number.isFinite(Number(options.intervalMs)) ? Number(options.intervalMs) : 50;
    const message = String(options.message || "Timed out waiting for Zotero host condition");
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const value = await condition();
      if (value) {
        return value;
      }
      await sleep(intervalMs);
    }

    throw new Error(message);
  }

  function getActiveTabID(window = getMainWindow()) {
    const selectedID = window?.Zotero_Tabs?.selectedID;
    return typeof selectedID === "string" && selectedID.trim()
      ? selectedID
      : null;
  }

  function getLibraryItemDetails(window = getMainWindow()) {
    return window?.ZoteroPane?.itemPane?._itemDetails || null;
  }

  function getContextPane(window = getMainWindow()) {
    return window?.ZoteroContextPane || null;
  }

  function getContextItemDetails(window = getMainWindow(), options = {}) {
    const contextPane = getContextPane(window);
    const tabID = String(options.tabID || getActiveTabID(window) || "").trim();
    if (!contextPane?.context || !tabID || typeof contextPane.context._getItemContext !== "function") {
      return null;
    }
    return contextPane.context._getItemContext(tabID) || null;
  }

  function getCurrentNotesContext(window = getMainWindow()) {
    const contextPane = getContextPane(window);
    if (!contextPane?.context || typeof contextPane.context._getCurrentNotesContext !== "function") {
      return null;
    }
    return contextPane.context._getCurrentNotesContext() || null;
  }

  function getWindowBounds(window) {
    if (!window) {
      return null;
    }

    const x = toFiniteNumber(window.screenX);
    const y = toFiniteNumber(window.screenY);
    const width = toFiniteNumber(window.outerWidth);
    const height = toFiniteNumber(window.outerHeight);
    if ([x, y, width, height].some((value) => value === null || value <= 0)) {
      return null;
    }

    return {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
      title: typeof window.document?.title === "string" && window.document.title.trim()
        ? window.document.title.trim()
        : null,
      source: "window",
    };
  }

  function getElementOwnerWindow(element) {
    return element?.ownerGlobal || element?.ownerDocument?.defaultView || null;
  }

  function getEmbeddingElement(window) {
    const candidates = [
      window?.frameElement,
      window?.browsingContext?.embedderElement,
      window?.windowGlobalChild?.embedderElement,
      window?.docShell?.chromeEventHandler,
    ];
    return candidates.find((candidate) => candidate && typeof candidate === "object") || null;
  }

  // Reader frame documents may not expose direct screen origins, so climb through
  // the embedding frame until we can resolve a stable top-level origin.
  function resolveWindowScreenOrigin(window, seenWindows = new Set(), seenElements = new Set()) {
    if (!window || seenWindows.has(window)) {
      return null;
    }
    seenWindows.add(window);

    const originX = toFiniteNumber(window?.mozInnerScreenX) ?? toFiniteNumber(window?.screenX);
    const originY = toFiniteNumber(window?.mozInnerScreenY) ?? toFiniteNumber(window?.screenY);
    if (![originX, originY].some((value) => value === null)) {
      return {
        x: originX,
        y: originY,
      };
    }

    const embeddingElement = getEmbeddingElement(window);
    if (!embeddingElement) {
      return null;
    }

    const frameRect = getElementScreenRectInternal(embeddingElement, seenWindows, seenElements);
    if (!frameRect) {
      return null;
    }

    return {
      x: frameRect.x,
      y: frameRect.y,
    };
  }

  function getElementScreenRectInternal(element, seenWindows = new Set(), seenElements = new Set()) {
    if (!element) {
      return null;
    }
    if (seenElements.has(element)) {
      return null;
    }
    seenElements.add(element);

    const window = getElementOwnerWindow(element);

    if (typeof element.getBoundingClientRect === "function") {
      const rect = element.getBoundingClientRect();
      const width = toFiniteNumber(rect?.width);
      const height = toFiniteNumber(rect?.height);
      const origin = resolveWindowScreenOrigin(window, seenWindows, seenElements);
      const left = toFiniteNumber(rect?.left);
      const top = toFiniteNumber(rect?.top);
      if (
        width
        && height
        && width > 0
        && height > 0
        && origin
        && ![origin.x, origin.y, left, top].some((value) => value === null)
      ) {
        return {
          x: Math.round(origin.x + left),
          y: Math.round(origin.y + top),
          width: Math.round(width),
          height: Math.round(height),
          title: typeof window?.document?.title === "string" && window.document.title.trim()
            ? window.document.title.trim()
            : null,
          source: "element",
        };
      }
    }

    const directScreenX = toFiniteNumber(element?.screenX)
      ?? toFiniteNumber(element?.popupBoxObject?.screenX);
    const directScreenY = toFiniteNumber(element?.screenY)
      ?? toFiniteNumber(element?.popupBoxObject?.screenY);
    const directWidth = toFiniteNumber(element?.outerWidth)
      ?? toFiniteNumber(element?.clientWidth)
      ?? toFiniteNumber(element?.popupBoxObject?.width);
    const directHeight = toFiniteNumber(element?.outerHeight)
      ?? toFiniteNumber(element?.clientHeight)
      ?? toFiniteNumber(element?.popupBoxObject?.height);
    if ([directScreenX, directScreenY, directWidth, directHeight].every((value) => value !== null && value > 0)) {
      return {
        x: Math.round(directScreenX),
        y: Math.round(directScreenY),
        width: Math.round(directWidth),
        height: Math.round(directHeight),
        title: typeof window?.document?.title === "string" && window.document.title.trim()
          ? window.document.title.trim()
          : null,
        source: "element-screen-metrics",
      };
    }

    const boxObject = element.boxObject;
    const x = toFiniteNumber(boxObject?.screenX);
    const y = toFiniteNumber(boxObject?.screenY);
    const width = toFiniteNumber(boxObject?.width);
    const height = toFiniteNumber(boxObject?.height);
    if ([x, y, width, height].some((value) => value === null || value <= 0)) {
      return null;
    }

    return {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
      title: typeof window?.document?.title === "string" && window.document.title.trim()
        ? window.document.title.trim()
        : null,
      source: "box-object",
    };
  }

  function getElementScreenRect(element) {
    return getElementScreenRectInternal(element, new Set(), new Set());
  }

  function buildSurfaceTarget({
    surfaceId,
    captureKind,
    label,
    element = null,
    window = null,
    details = {},
  }) {
    const rect = element ? getElementScreenRect(element) : null;
    const windowBounds = window ? getWindowBounds(window) : null;
    return {
      surfaceId: String(surfaceId || "").trim() || null,
      captureKind: sanitizeCaptureToken(captureKind, "surface"),
      label: String(label || "").trim() || null,
      scope: "surface-local",
      rect,
      windowBounds,
      details: details && typeof details === "object"
        ? JSON.parse(JSON.stringify(details))
        : {},
    };
  }

  function simulatePopupEvent(popup, type) {
    if (!popup || typeof popup.dispatchEvent !== "function") {
      return;
    }
    const ownerWindow = popup.ownerGlobal || popup.ownerDocument?.defaultView || null;
    const EventCtor = ownerWindow?.Event || globalScope.Event;
    const event = EventCtor
      ? new EventCtor(type, { bubbles: true, cancelable: true })
      : { type };
    popup.dispatchEvent(event);
  }

  function readReaderMenuSubType(reader) {
    const directType = typeof reader?.type === "string" && reader.type.trim()
      ? reader.type.trim()
      : null;
    if (directType) {
      return directType;
    }

    const internalType = typeof reader?._type === "string" && reader._type.trim()
      ? reader._type.trim()
      : null;
    if (internalType) {
      return internalType;
    }

    const itemID = toFiniteNumber(reader?.itemID);
    if (itemID !== null && zotero?.Items && typeof zotero.Items.get === "function") {
      try {
        const item = zotero.Items.get(itemID);
        if (typeof item?.attachmentReaderType === "string" && item.attachmentReaderType.trim()) {
          return item.attachmentReaderType.trim();
        }
      }
      catch {}
    }

    return null;
  }

  function buildReaderMenuPopupUpdateArgs(target, options = {}) {
    if (!String(target || "").startsWith("reader/menubar/")) {
      return null;
    }

    const reader = options.reader || null;
    const tabSubType = readReaderMenuSubType(reader);
    const itemID = toFiniteNumber(reader?.itemID);
    let item = null;
    if (itemID !== null && zotero?.Items && typeof zotero.Items.get === "function") {
      try {
        item = zotero.Items.get(itemID) || null;
      }
      catch {}
    }

    return {
      event: {
        type: "popupshowing",
      },
      tabType: "reader",
      tabSubType,
      getContext: () => ({
        items: item ? [item] : [],
        tabType: "reader",
        tabSubType,
        tabID: typeof reader?.tabID === "string" && reader.tabID.trim()
          ? reader.tabID.trim()
          : undefined,
      }),
    };
  }

  function refreshCustomMenuPopup(target, popup, options = {}) {
    if (
      !popup
      || !zotero?.MenuManager
      || typeof zotero.MenuManager.updateMenuPopup !== "function"
    ) {
      return false;
    }

    const args = buildReaderMenuPopupUpdateArgs(target, options);
    if (!args) {
      return false;
    }

    zotero.MenuManager.updateMenuPopup(popup, target, args);
    return true;
  }

  async function simulatePopupOpen(popup) {
    await waitFor(() => popup, {
      timeoutMs: 3000,
      intervalMs: 25,
      message: "Timed out waiting for live menu popup",
    });
    simulatePopupEvent(popup, "popupshowing");
    simulatePopupEvent(popup, "popupshown");
    return popup;
  }

  async function simulatePopupClose(popup) {
    if (!popup) {
      return;
    }
    simulatePopupEvent(popup, "popuphiding");
    simulatePopupEvent(popup, "popuphidden");
  }

  function resolveMenuDocument(target, options = {}) {
    if (String(target || "").startsWith("reader/menubar/")) {
      if (options.readerWindow?.document) {
        return options.readerWindow.document;
      }
      if (options.window?.document) {
        return options.window.document;
      }
    }
    return options.window?.document || getMainWindow()?.document || null;
  }

  async function resolveMenuPopup(target, options = {}) {
    const window = options.window || getMainWindow();
    if (!window) {
      throw new Error("Unable to resolve Zotero main window for menu target");
    }
    const doc = resolveMenuDocument(target, {
      window,
      readerWindow: options.readerWindow || options.reader?._window || null,
    });
    if (!doc) {
      throw new Error(`Unable to resolve menu document for target '${target}'`);
    }

    const popupSelectors = {
      "main/menubar/file": "#menu_FilePopup",
      "main/menubar/edit": "#menu_EditPopup",
      "main/menubar/view": "#menu_viewPopup",
      "main/menubar/go": "#menu_goPopup",
      "main/menubar/tools": "#menu_ToolsPopup",
      "main/menubar/help": "#menu_HelpPopup",
      "main/library/addAttachment": "#menu_attachmentAdd > menupopup",
      "main/library/addNote": "#menu_noteAdd > menupopup",
      "reader/menubar/file": "#menu_FilePopup",
      "reader/menubar/edit": "#menu_EditPopup",
      "reader/menubar/view": "#menu_viewPopup",
      "reader/menubar/go": "#menu_goPopup",
      "reader/menubar/window": "#windowPopup",
    };

    if (popupSelectors[target]) {
      const popup = doc.querySelector(popupSelectors[target]);
      if (!popup) {
        throw new Error(`Unable to find menu popup for target '${target}'`);
      }
      return {
        popup,
        async open() {
          refreshCustomMenuPopup(target, popup, options);
          await simulatePopupOpen(popup);
          return popup;
        },
        async close() {
          await simulatePopupClose(popup);
        },
      };
    }

    if (target === "main/library/item") {
      const popup = doc.querySelector("#zotero-itemmenu");
      if (!popup || typeof window?.ZoteroPane?.onItemsContextMenuOpen !== "function") {
        throw new Error("Unable to resolve main/library/item popup");
      }
      return {
        popup,
        async open() {
          window.ZoteroPane.onItemsContextMenuOpen(new window.MouseEvent("contextmenu"), 0, 0);
          await simulatePopupOpen(popup);
          return popup;
        },
        async close() {
          await simulatePopupClose(popup);
        },
      };
    }

    if (target === "main/library/collection") {
      const popup = doc.querySelector("#zotero-collectionmenu");
      if (!popup || typeof window?.ZoteroPane?.onCollectionsContextMenuOpen !== "function") {
        throw new Error("Unable to resolve main/library/collection popup");
      }
      return {
        popup,
        async open() {
          window.ZoteroPane.onCollectionsContextMenuOpen(new window.MouseEvent("contextmenu"), 0, 0);
          await simulatePopupOpen(popup);
          return popup;
        },
        async close() {
          await simulatePopupClose(popup);
        },
      };
    }

    if (target === "main/tab") {
      if (typeof window?.Zotero_Tabs?._openMenu !== "function") {
        throw new Error("Unable to resolve main/tab popup");
      }
      return {
        popup: null,
        async open() {
          const popup = await window.Zotero_Tabs._openMenu(0, 0, options.tabID || getActiveTabID(window));
          await simulatePopupOpen(popup);
          return popup;
        },
        async close(popup) {
          await simulatePopupClose(popup);
        },
      };
    }

    if (target === "itemPane/info/row") {
      const itemDetails = getLibraryItemDetails(window);
      const infoBox = itemDetails?.getPane?.("info");
      const rowSelector = String(options.rowSelector || "#itembox-field-value-title").trim() || "#itembox-field-value-title";
      const row = infoBox?.querySelector?.(rowSelector);
      const popup = infoBox?.querySelector?.("#zotero-field-menu");
      if (!row || !popup) {
        throw new Error("Unable to resolve itemPane/info/row popup");
      }
      return {
        popup,
        async open() {
          row.dispatchEvent(new window.MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
          }));
          await simulatePopupOpen(popup);
          return popup;
        },
        async close() {
          await simulatePopupClose(popup);
        },
      };
    }

    if (target === "sidenav/locate") {
      const button = window?.ZoteroPane?.itemPane?._sidenav?.querySelector?.("toolbarbutton[data-action='locate']");
      const popup = button?.querySelector?.("menupopup");
      if (!button || !popup) {
        throw new Error("Unable to resolve sidenav/locate popup");
      }
      return {
        popup,
        async open() {
          button.dispatchEvent(new window.MouseEvent("mousedown", {
            bubbles: true,
            cancelable: true,
          }));
          await simulatePopupOpen(popup);
          return popup;
        },
        async close() {
          await simulatePopupClose(popup);
        },
      };
    }

    throw new Error(`Unsupported live menu target '${target}'`);
  }

  async function openPreferences(paneID = null, options = {}) {
    const effectivePaneID = typeof paneID === "string" && paneID.trim() ? paneID.trim() : null;
    const effectiveOptions = options && typeof options === "object" ? options : {};

    if (zotero?.Utilities?.Internal && typeof zotero.Utilities.Internal.openPreferences === "function") {
      const win = zotero.Utilities.Internal.openPreferences(effectivePaneID, effectiveOptions);
      if (win) {
        return win;
      }
    }

    const mainWindow = getMainWindow();
    if (mainWindow?.ZoteroPane && typeof mainWindow.ZoteroPane.openPreferences === "function") {
      mainWindow.ZoteroPane.openPreferences(effectivePaneID);
      return await waitFor(() => getPreferenceWindow(), {
        timeoutMs: effectiveOptions.timeoutMs ?? 5000,
        intervalMs: 50,
        message: "Timed out waiting for preferences window after ZoteroPane.openPreferences()",
      });
    }

    throw new Error("Zotero preferences host entrypoint is unavailable");
  }

  async function preparePreferencePane(options = {}) {
    const paneID = String(options.paneID || "").trim() || null;
    const scrollTo = typeof options.scrollTo === "string" && options.scrollTo.trim()
      ? options.scrollTo.trim()
      : undefined;
    const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : 8000;
    const window = await openPreferences(paneID, {
      scrollTo,
      timeoutMs,
    });

    const preferenceWindow = await waitFor(
      () => getPreferenceWindow() || window || null,
      {
        timeoutMs,
        intervalMs: 50,
        message: "Timed out waiting for preferences window",
      },
    );
    const preferences = await waitFor(
      () => preferenceWindow?.Zotero_Preferences || null,
      {
        timeoutMs,
        intervalMs: 50,
        message: "Timed out waiting for Zotero_Preferences",
      },
    );

    if (typeof preferences.waitForFirstPaneLoad === "function") {
      await preferences.waitForFirstPaneLoad();
    }
    if (paneID && typeof preferences.navigateToPane === "function") {
      await preferences.navigateToPane(paneID, { scrollTo });
    }

    const prepared = await waitFor(() => {
      const resolvedPaneID = paneID || String(preferences.navigation?.value || "").trim() || null;
      const selectedPaneID = String(preferences.navigation?.value || "").trim() || null;
      const pane = resolvedPaneID && typeof preferences.panes?.get === "function"
        ? preferences.panes.get(resolvedPaneID)
        : null;
      const paneElement = pane?.container || preferenceWindow.document?.getElementById?.(resolvedPaneID) || null;
      const preferenceSurface = inspectPreferencePaneSurface(paneElement, pane);
      if (!paneElement) {
        return null;
      }
      if (paneID && selectedPaneID !== paneID) {
        return null;
      }
      if (!isReadyPreferencePaneSurface(preferenceSurface)) {
        return null;
      }
      return {
        window: preferenceWindow,
        preferences,
        paneID: resolvedPaneID,
        pane,
        paneElement,
        selectedPaneID,
        preferenceSurface,
      };
    }, {
      timeoutMs,
      intervalMs: 50,
      message: paneID
        ? `Timed out waiting for preference pane '${paneID}' content`
        : "Timed out waiting for mounted preference pane content",
    });

    const surfaceResolution = () => {
      const resolved = resolvePreferenceSurfaceRoot(prepared.paneElement, prepared.pane);
      return {
        element: resolved.element || prepared.paneElement,
        strategy: resolved.strategy || (prepared.paneElement ? "pane-container" : null),
      };
    };
    const settleBudgetMs = Math.min(
      1500,
      Math.max(350, Math.floor(timeoutMs * 0.2)),
    );
    const surfaceGeometrySettle = await settlePreferenceSurfaceGeometry(surfaceResolution, {
      timeoutMs: settleBudgetMs,
      intervalMs: 50,
      minObservationMs: Math.min(800, Math.max(250, Math.floor(settleBudgetMs * 0.6))),
      quietWindowMs: Math.min(320, Math.max(120, Math.floor(settleBudgetMs * 0.25))),
    });
    const finalSurfaceResolution = surfaceResolution();

    return {
      ...prepared,
      preferenceSurface: inspectPreferencePaneSurface(prepared.paneElement, prepared.pane),
      surfaceElement: finalSurfaceResolution.element || prepared.paneElement,
      surfaceElementStrategy: finalSurfaceResolution.strategy || null,
      surfaceGeometrySettle,
    };
  }

  function getContextPaneState(window = getMainWindow()) {
    const contextPane = getContextPane(window);
    const tabID = getActiveTabID(window);
    return {
      available: Boolean(contextPane),
      open: contextPane ? !Boolean(contextPane.collapsed) : false,
      tabID,
      mode: typeof contextPane?.context?.mode === "string" && contextPane.context.mode.trim()
        ? contextPane.context.mode.trim()
        : null,
      hasItemContext: Boolean(getContextItemDetails(window, { tabID })),
      hasNotesContext: Boolean(getCurrentNotesContext(window)),
    };
  }

  function findPaneButton(root, paneID) {
    if (!root || !paneID) {
      return null;
    }

    if (typeof root.querySelectorAll === "function") {
      try {
        const buttons = root.querySelectorAll(".btn[data-pane], [data-pane]");
        for (const button of buttons) {
          const candidatePaneID = typeof button?.getAttribute === "function"
            ? String(button.getAttribute("data-pane") || "").trim()
            : String(button?.dataset?.pane || "").trim();
          if (candidatePaneID === paneID) {
            return button;
          }
        }
      }
      catch {}
    }

    if (typeof root.querySelector !== "function") {
      return null;
    }

    try {
      const escapedPaneID = globalScope.CSS?.escape ? globalScope.CSS.escape(paneID) : paneID;
      return root.querySelector(`.btn[data-pane="${escapedPaneID}"], [data-pane="${escapedPaneID}"]`);
    }
    catch {
      return null;
    }
  }

  function dispatchElementClick(element) {
    if (!element) {
      return {
        activationStrategy: null,
        actionDispatched: false,
      };
    }

    const localName = String(element.localName || element.tagName || "").trim().toLowerCase();
    const role = typeof element.getAttribute === "function"
      ? String(element.getAttribute("role") || "").trim().toLowerCase()
      : "";
    const isSyntheticClickPreferred = Boolean(
      (typeof element.getAttribute === "function" && element.getAttribute("data-pane"))
      || role === "tab"
      || localName === "div"
      || localName === "span"
    );

    if (!isSyntheticClickPreferred && typeof element.click === "function") {
      element.click();
      return {
        activationStrategy: "click",
        actionDispatched: true,
      };
    }

    if (typeof element.dispatchEvent === "function") {
      const ownerWindow = element.ownerGlobal || element.ownerDocument?.defaultView || globalScope;
      const MouseEventCtor = ownerWindow?.MouseEvent || globalScope.MouseEvent;
      if (MouseEventCtor) {
        element.dispatchEvent(new MouseEventCtor("click", {
          bubbles: true,
          cancelable: true,
          button: 0,
          detail: 1,
        }));
        return {
          activationStrategy: "dispatch-click",
          actionDispatched: true,
        };
      }
    }

    if (typeof element.click === "function") {
      element.click();
      return {
        activationStrategy: "click",
        actionDispatched: true,
      };
    }

    return {
      activationStrategy: null,
      actionDispatched: false,
    };
  }

  async function waitForPaneVisible(itemDetails, paneID, options = {}) {
    const isPaneVisible = () => {
      if (!itemDetails || !paneID) {
        return false;
      }

      if (typeof itemDetails.isPaneVisible === "function") {
        try {
          if (itemDetails.isPaneVisible(paneID) === true) {
            return true;
          }
        }
        catch {}
      }

      const pane = itemDetails.getPane?.(paneID) || null;
      if (!pane) {
        return false;
      }
      const isHidden = pane.hidden === true
        || (typeof pane.getAttribute === "function" && pane.getAttribute("hidden") !== null);
      if (isHidden) {
        return false;
      }

      const paneRect = typeof pane.getBoundingClientRect === "function"
        ? pane.getBoundingClientRect()
        : null;
      const container = itemDetails._paneParent || pane.parentElement || null;
      const containerRect = typeof container?.getBoundingClientRect === "function"
        ? container.getBoundingClientRect()
        : null;
      if (paneRect && containerRect) {
        return paneRect.top < containerRect.bottom && paneRect.bottom > containerRect.top;
      }

      return true;
    };

    await waitFor(
      () => isPaneVisible(),
      {
        timeoutMs: options.timeoutMs ?? 5000,
        intervalMs: 50,
        message: `Timed out waiting for pane '${paneID}'`,
      },
    );
  }

  async function selectPaneInContainer(itemDetails, paneID, options = {}) {
    if (!itemDetails) {
      throw new Error("Pane container is unavailable");
    }

    const activationPolicy = normalizeActivationPolicy(options.activationPolicy);
    const paneButton = findPaneButton(itemDetails.sidenav || null, paneID);
    let activationStrategy = null;
    let actionDispatched = false;
    let lastError = null;

    if (activationPolicy !== "ui-required" && typeof itemDetails.scrollToPane === "function") {
      try {
        await itemDetails.scrollToPane(paneID, options.behavior || "instant");
        activationStrategy = "host-api";
        actionDispatched = true;
      }
      catch (error) {
        lastError = error;
      }
    }

    if ((!actionDispatched || activationPolicy === "ui-required") && paneButton) {
      try {
        const liveActivation = dispatchElementClick(paneButton);
        activationStrategy = liveActivation.activationStrategy;
        actionDispatched = liveActivation.actionDispatched;
      }
      catch (error) {
        lastError = error;
      }
    }

    if (!actionDispatched) {
      if (activationPolicy === "ui-required") {
        throw lastError || new Error(`Unable to replay a live UI action for pane '${paneID}'`);
      }
      throw lastError || new Error(`Unable to activate pane '${paneID}'`);
    }

    await waitForPaneVisible(itemDetails, paneID, options);
    try {
      await waitFor(
        () => {
          const pane = itemDetails.getPane?.(paneID) || null;
          return hasMountedPaneContent(pane) ? pane : null;
        },
        {
          timeoutMs: options.timeoutMs ?? 5000,
          intervalMs: 50,
          message: `Timed out waiting for mounted pane content for '${paneID}'`,
        },
      );
    }
    catch {}
    const visible = typeof itemDetails.isPaneVisible === "function"
      ? Boolean(itemDetails.isPaneVisible(paneID))
      : Boolean(itemDetails.getPane?.(paneID));

    return {
      container: itemDetails,
      pane: itemDetails.getPane?.(paneID) || null,
      visible,
      button: paneButton,
      activationPolicy,
      activationStrategy,
      actionElementObserved: Boolean(paneButton),
      actionDispatched,
    };
  }

  async function setContextPaneOpen(open, options = {}) {
    const window = options.window || getMainWindow();
    const contextPane = getContextPane(window);
    if (!contextPane) {
      throw new Error("ZoteroContextPane is unavailable");
    }

    contextPane.collapsed = !open;
    await waitFor(
      () => !Boolean(contextPane.collapsed) === Boolean(open),
      {
        timeoutMs: options.timeoutMs ?? 5000,
        intervalMs: 50,
        message: `Timed out waiting for context pane to become ${open ? "open" : "closed"}`,
      },
    );
    return getContextPaneState(window);
  }

  async function selectItemPane(paneID, options = {}) {
    const window = options.window || getMainWindow();
    const itemDetails = getLibraryItemDetails(window);
    if (!itemDetails) {
      throw new Error("Library Item Pane container is unavailable");
    }

    return await selectPaneInContainer(itemDetails, paneID, {
      behavior: options.behavior,
      timeoutMs: options.timeoutMs,
      activationPolicy: options.activationPolicy,
    });
  }

  async function selectContextPane(paneID, options = {}) {
    const window = options.window || getMainWindow();
    const contextPaneState = await setContextPaneOpen(true, {
      window,
      timeoutMs: options.timeoutMs,
    });
    const itemDetails = getContextItemDetails(window, {
      tabID: options.tabID || contextPaneState.tabID,
    });
    if (!itemDetails) {
      throw new Error("Context item pane container is unavailable");
    }

    const result = await selectPaneInContainer(itemDetails, paneID, {
      behavior: options.behavior,
      timeoutMs: options.timeoutMs,
      activationPolicy: options.activationPolicy,
    });
    return {
      ...result,
      tabID: options.tabID || contextPaneState.tabID,
    };
  }

  return {
    hostLog,
    showAlert,
    addToolsMenuItem,
    resolveContentUrl,
    injectStyleSheet,
    insertFTLIfNeeded,
    listMainWindows,
    listWindowsByType,
    listPreferenceWindows,
    getPreferenceWindow,
    getMainWindow,
    waitFor,
    getActiveTabID,
    getLibraryItemDetails,
    getContextPane,
    getContextItemDetails,
    getCurrentNotesContext,
    getWindowBounds,
    getElementScreenRect,
    buildSurfaceTarget,
    resolveMenuPopup,
    simulatePopupOpen,
    simulatePopupClose,
    openPreferences,
    preparePreferencePane,
    getContextPaneState,
    setContextPaneOpen,
    selectItemPane,
    selectContextPane,
  };
}
