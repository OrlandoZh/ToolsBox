function createMenuElement(window) {
  if (typeof window.document.createXULElement === "function") {
    return window.document.createXULElement("menuitem");
  }
  return window.document.createElement("menuitem");
}

export function createZoteroHost({ globalScope, rootURI = "" }) {
  const zotero = globalScope.Zotero;
  const services = globalScope.Services;
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
      } catch {}
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

  return {
    hostLog,
    showAlert,
    addToolsMenuItem,
    resolveContentUrl,
    injectStyleSheet,
    insertFTLIfNeeded,
    listMainWindows,
    getMainWindow,
  };
}
