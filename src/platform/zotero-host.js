function createMenuElement(window) {
  if (typeof window.document.createXULElement === "function") {
    return window.document.createXULElement("menuitem");
  }
  return window.document.createElement("menuitem");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  function getElementScreenRect(element) {
    if (!element || typeof element.getBoundingClientRect !== "function") {
      return null;
    }

    const rect = element.getBoundingClientRect();
    const width = toFiniteNumber(rect?.width);
    const height = toFiniteNumber(rect?.height);
    if (!width || !height || width <= 0 || height <= 0) {
      return null;
    }

    const window = element.ownerGlobal || element.ownerDocument?.defaultView || null;
    if (!window) {
      return null;
    }
    const originX = toFiniteNumber(window.mozInnerScreenX) ?? toFiniteNumber(window.screenX);
    const originY = toFiniteNumber(window.mozInnerScreenY) ?? toFiniteNumber(window.screenY);
    const left = toFiniteNumber(rect.left);
    const top = toFiniteNumber(rect.top);
    if ([originX, originY, left, top].some((value) => value === null)) {
      return null;
    }

    return {
      x: Math.round(originX + left),
      y: Math.round(originY + top),
      width: Math.round(width),
      height: Math.round(height),
      title: typeof window.document?.title === "string" && window.document.title.trim()
        ? window.document.title.trim()
        : null,
      source: "element",
    };
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
    const MouseEventCtor = ownerWindow?.MouseEvent || globalScope.MouseEvent;
    const event = MouseEventCtor
      ? new MouseEventCtor(type, { bubbles: true, cancelable: true })
      : { type };
    popup.dispatchEvent(event);
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
    if (paneID && typeof preferences.waitForPaneSelect === "function") {
      await preferences.waitForPaneSelect();
    }

    const resolvedPaneID = paneID || String(preferences.navigation?.value || "").trim() || null;
    const pane = resolvedPaneID && typeof preferences.panes?.get === "function"
      ? preferences.panes.get(resolvedPaneID)
      : null;
    const paneElement = pane?.container || preferenceWindow.document?.getElementById?.(resolvedPaneID) || null;
    return {
      window: preferenceWindow,
      preferences,
      paneID: resolvedPaneID,
      pane,
      paneElement,
      selectedPaneID: String(preferences.navigation?.value || "").trim() || null,
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
    if (!itemDetails || typeof itemDetails.scrollToPane !== "function") {
      throw new Error("Library Item Pane container is unavailable");
    }

    await itemDetails.scrollToPane(paneID, options.behavior || "instant");
    await waitFor(
      () => itemDetails.isPaneVisible?.(paneID) === true || itemDetails.getPane?.(paneID),
      {
        timeoutMs: options.timeoutMs ?? 5000,
        intervalMs: 50,
        message: `Timed out waiting for Item Pane '${paneID}'`,
      },
    );
    return {
      container: itemDetails,
      pane: itemDetails.getPane?.(paneID) || null,
      visible: Boolean(itemDetails.isPaneVisible?.(paneID)),
    };
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
    if (!itemDetails || typeof itemDetails.scrollToPane !== "function") {
      throw new Error("Context item pane container is unavailable");
    }

    await itemDetails.scrollToPane(paneID, options.behavior || "instant");
    await waitFor(
      () => itemDetails.isPaneVisible?.(paneID) === true || itemDetails.getPane?.(paneID),
      {
        timeoutMs: options.timeoutMs ?? 5000,
        intervalMs: 50,
        message: `Timed out waiting for context pane '${paneID}'`,
      },
    );
    return {
      container: itemDetails,
      pane: itemDetails.getPane?.(paneID) || null,
      visible: Boolean(itemDetails.isPaneVisible?.(paneID)),
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
