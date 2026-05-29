import { createWindowShellManager } from "../utils/window-shell.js";

const WINDOW_FEATURES = "chrome,dialog=no,centerscreen,resizable,status";

function noop() {}

export function resolveThemeMode(prefs) {
  const mode = prefs?.getStringPref?.("themeMode") || prefs?.get?.("themeMode") || "";
  if (mode === "light" || mode === "dark") {
    return mode;
  }
  return "light";
}

export function resolveShellHref(rootURI, fileName) {
  const base = String(rootURI || "").replace(/\/+$/, "");
  return `${base}/content/lib/${fileName}`;
}

function waitForWorkbenchShellNavigation(window, shellFileName, { timeoutMs = 10000, intervalMs = 50 } = {}) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    function readState() {
      try {
        return {
          href: String(window?.location?.href || ""),
          readyState: String(window?.document?.readyState || ""),
        };
      } catch {
        return {
          href: "",
          readyState: "",
        };
      }
    }

    function poll() {
      if (!window || window.closed) {
        reject(new Error("workbench shell closed before navigation"));
        return;
      }
      const state = readState();
      if (
        state.href.includes(shellFileName)
        && (state.readyState === "interactive" || state.readyState === "complete")
      ) {
        resolve(window);
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error(`Timed out waiting for workbench shell navigation: href=${state.href || "unknown"}`));
        return;
      }
      setTimeout(poll, intervalMs);
    }

    poll();
  });
}

export function createWorkbenchShellManager(options) {
  const {
    logger,
    host,
    rootURI,
    addonRef,
    addonName,
    prefs,
    shellFileName,
    windowName,
    windowWidth = 1100,
    windowHeight = 750,
    buildPayload,
    onWindowClosed,
  } = options;

  function findLiveWindow() {
    const windows = host?.listWindowsByType?.(null) || [];
    for (const win of windows) {
      try {
        if (win?.location?.href?.includes(shellFileName)) {
          return win;
        }
      } catch (_) { /* cross-origin */ }
    }
    return null;
  }

  function openWindow() {
    const existing = findLiveWindow();
    if (existing && !existing.closed) {
      return { window: existing };
    }
    const mainWindow = host?.getPrimaryWindow?.()
      || host?.getMainWindow?.()
      || globalThis.Zotero?.getMainWindow?.();
    if (!mainWindow || mainWindow.closed) {
      throw new Error("No main Zotero window available");
    }
    const openerWindow = typeof globalThis.ChromeUtils?.waiveXrays === "function"
      ? globalThis.ChromeUtils.waiveXrays(mainWindow)
      : mainWindow;
    const href = resolveShellHref(rootURI, shellFileName);
    const features = `${WINDOW_FEATURES},width=${windowWidth},height=${windowHeight}`;
    let win = null;
    if (typeof openerWindow.eval === "function" && typeof openerWindow.openDialog === "function") {
      win = openerWindow.eval(
        `window.openDialog(${JSON.stringify(href)}, ${JSON.stringify(windowName)}, ${JSON.stringify(features)})`,
      );
    }
    if (!win && typeof globalThis.Services?.ww?.openWindow === "function") {
      win = globalThis.Services.ww.openWindow(openerWindow, href, windowName, features, null);
    }
    if (!win && typeof openerWindow.openDialog === "function") {
      win = openerWindow.openDialog(href, windowName, features);
    }
    if (!win && typeof openerWindow.open === "function") {
      win = openerWindow.open(href, windowName, `resizable,width=${windowWidth},height=${windowHeight}`);
    }
    try {
      if (win && !String(win.location?.href || "").includes(shellFileName)) {
        win.location.href = href;
      }
    } catch {}
    return {
      window: win,
      readyPromise: waitForWorkbenchShellNavigation(win, shellFileName),
    };
  }

  function mountWindow({ window, context }) {
    if (!window || window.closed) {
      return noop;
    }
    const doc = window.document;
    if (!doc) {
      return noop;
    }
    const html = doc.documentElement;
    if (html) {
      html.setAttribute("data-addon-ref", addonRef);
      html.setAttribute("data-addon-name", addonName);
      html.setAttribute("data-theme", resolveThemeMode(prefs));
    }
    const payload = typeof buildPayload === "function"
      ? buildPayload(context)
      : context;
    const bridgeKey = `__${addonRef.replace(/-/g, "_")}_WorkbenchBridge__`;
    const bridge = window[bridgeKey];
    if (bridge && typeof bridge.mount === "function") {
      bridge.mount(payload);
    }
    const cleanup = () => {
      const b = window[bridgeKey];
      if (b && typeof b.unmount === "function") {
        try { b.unmount(); } catch (_) { /* best-effort */ }
      }
    };
    window.addEventListener("unload", cleanup, { once: true });
    return cleanup;
  }

  const shell = createWindowShellManager({
    logger,
    openWindow,
    mountWindow,
    isWindowAlive: (w) => Boolean(w && !w.closed),
    onWindowClosed: onWindowClosed
      ? (evt) => { try { onWindowClosed(evt); } catch (_) { /* best-effort */ } }
      : undefined,
  });

  const originalOpen = shell.open;
  shell.open = async function (context) {
    const live = findLiveWindow();
    if (live && !live.closed) {
      const result = await shell.refresh(context);
      return {
        ...result,
        reused: true,
      };
    }
    return originalOpen(context);
  };

  return shell;
}

export function createWorkbenchBridgeAPI(deps) {
  const { getSnapshot, getThemeMode } = deps;
  return Object.freeze({
    getSnapshot: typeof getSnapshot === "function" ? getSnapshot : () => ({}),
    getThemeMode: typeof getThemeMode === "function" ? getThemeMode : () => "light",
  });
}

export function collectItemRelationships(item, zotero) {
  const nodes = [];
  const edges = [];
  const seen = new Set();
  if (!item || !zotero) {
    return { nodes, edges };
  }
  const addNode = (it) => {
    if (!it || seen.has(it.id)) return;
    seen.add(it.id);
    const type = it.itemType || it.getField?.("itemType") || "unknown";
    nodes.push({
      id: it.id,
      label: (it.getField?.("title") || it.title || "").slice(0, 40),
      type,
    });
  };
  addNode(item);

  try {
    const itemID = item.id;
    const rels = zotero.Relations?.getByItem?.(item) || [];
    for (const [pred, targetURI] of rels) {
      const targetID = zotero.URI?.getItemID?.(targetURI);
      if (targetID) {
        const target = zotero.Items?.get?.(targetID);
        if (target) {
          addNode(target);
          edges.push({ source: itemID, target: targetID, label: String(pred).split("/").pop() || "related" });
        }
      }
    }
  } catch (_) { /* Relations API not available */ }

  try {
    const attachments = item.getAttachments?.() || [];
    for (const attID of attachments) {
      const att = zotero.Items?.get?.(attID);
      if (att) {
        addNode(att);
        edges.push({ source: item.id, target: attID, label: "attachment" });
      }
    }
  } catch (_) { /* Attachments API not available */ }

  try {
    const tags = item.getTags?.() || [];
    for (const tag of tags) {
      const tagName = tag.tag || tag;
      const taggedItems = zotero.Items?.searchByTag?.(tagName) || [];
      for (const tagged of taggedItems) {
        if (tagged.id !== item.id) {
          addNode(tagged);
          edges.push({ source: item.id, target: tagged.id, label: "shared-tag" });
        }
      }
    }
  } catch (_) { /* Tag search not available */ }

  return { nodes, edges };
}

export function collectAnnotations(attachmentID, reader) {
  if (!reader || typeof reader.getAnnotations !== "function") {
    return [];
  }
  try {
    return reader.getAnnotations(attachmentID) || [];
  } catch (_) {
    return [];
  }
}

export function collectNotes(item, zotero) {
  const notes = [];
  if (!item || !zotero) {
    return notes;
  }
  try {
    const noteIDs = item.getNotes?.() || [];
    for (const noteID of noteIDs) {
      const note = zotero.Items?.get?.(noteID);
      if (note) {
        notes.push({
          id: note.id,
          text: note.getNote?.() || note.note || "",
          dateAdded: note.dateAdded || "",
          dateModified: note.dateModified || "",
        });
      }
    }
  } catch (_) { /* Notes API not available */ }
  return notes;
}

export function collectCreatorString(item) {
  try {
    const creators = item.getCreators?.() || [];
    return creators.map((c) => {
      const name = c.lastName || c.name || "";
      const first = c.firstName || "";
      return first ? `${name}, ${first}` : name;
    }).join("; ");
  } catch (_) {
    return "";
  }
}

export function resolveYear(item) {
  try {
    const date = item.getField?.("date") || item.date || "";
    const match = String(date).match(/\d{4}/);
    return match ? match[0] : "";
  } catch (_) {
    return "";
  }
}

export function resolvePublicationName(item) {
  try {
    return item.getField?.("publicationTitle")
      || item.getField?.("conferenceName")
      || item.getField?.("university")
      || item.getField?.("publisher")
      || "";
  } catch (_) {
    return "";
  }
}

export function resolveBridgeKey(addonRef) {
  return `__${String(addonRef).replace(/-/g, "_")}_WorkbenchBridge__`;
}
