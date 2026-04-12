import { createWindowShellManager } from "../utils/window-shell.js";
import {
  mountReactSurface,
  unmountReactSurface,
  updateReactSurface,
} from "../utils/react-surface-bridge.js";
import {
  SURFACE_WINDOW_MODE_DOCKED,
  resolveSurfaceWindowModeDecision,
} from "../utils/surface-window-mode.js";

function isOptionalBundleEnabled(optionalBundles, bundleID) {
  if (optionalBundles && typeof optionalBundles.isEnabled === "function") {
    return optionalBundles.isEnabled(bundleID);
  }
  if (optionalBundles && typeof optionalBundles.getBundle === "function") {
    return Boolean(optionalBundles.getBundle(bundleID)?.enabled);
  }
  return false;
}

export function createReactUIDemoLauncher({
  config,
  logger,
  host,
  themeManager,
  optionalBundles,
  services = null,
  rootURI = "",
} = {}) {
  const bundleID = "react-ui";
  const itemPaneSurfaceRecords = new Map();
  let lastPresentation = null;

  function isEnabled() {
    return isOptionalBundleEnabled(optionalBundles, bundleID);
  }

  function debug(message, details = {}) {
    if (logger && typeof logger.debug === "function") {
      logger.debug(message, details);
    }
  }

  function warn(message, details = {}) {
    if (logger && typeof logger.warn === "function") {
      logger.warn(message, details);
    }
  }

  function createHTMLElement(doc, tagName) {
    if (typeof doc?.createElementNS === "function") {
      return doc.createElementNS("http://www.w3.org/1999/xhtml", tagName);
    }
    return doc?.createElement?.(tagName) || null;
  }

  function clonePresentation(decision = null) {
    if (!decision || typeof decision !== "object") {
      return null;
    }
    return {
      preferredWindowMode: decision.preferredWindowMode || null,
      requestedWindowMode: decision.requestedWindowMode || null,
      effectiveWindowMode: decision.effectiveWindowMode || null,
      surfaceKind: decision.surfaceKind || null,
      windowModeSource: decision.windowModeSource || null,
      fallback: decision.fallback === true,
      fallbackReason: decision.fallbackReason || null,
    };
  }

  function rememberPresentation(decision = null) {
    lastPresentation = clonePresentation(decision);
    return clonePresentation(lastPresentation);
  }

  function isDockTargetAvailable(body) {
    return Boolean(body && typeof body.appendChild === "function");
  }

  function resolvePresentation(context = {}) {
    const dockedAvailable = context.dockedAvailable ?? isDockTargetAvailable(context.body);
    const dockedFallbackReason = dockedAvailable
      ? context.dockedFallbackReason
      : (String(context.dockedFallbackReason || "").trim() || "host-pane-unavailable");
    return resolveSurfaceWindowModeDecision({
      preferredWindowMode: context.preferredWindowMode ?? context.windowMode,
      dockedAvailable,
      dockedFallbackReason,
    });
  }

  function ensureItemPaneSurfaceContainer(doc, body) {
    const existing = itemPaneSurfaceRecords.get(body) || null;
    if (existing?.container) {
      return existing;
    }

    const container = createHTMLElement(doc, "section");
    if (!container) {
      return null;
    }

    container.id = `${config?.addonRef || "cleanroomtemplate"}-react-ui-item-pane-surface`;
    container.className = "cleanroom-react-ui-item-pane-surface";
    container.dataset.cleanroomReactSurface = "item-pane";
    container.dataset.bundleId = bundleID;
    const themeCleanup = typeof themeManager?.mountElement === "function"
      ? themeManager.mountElement(container, {
        window: doc?.defaultView || null,
      })
      : null;

    const record = {
      body,
      container,
      mounted: false,
      themeCleanup: typeof themeCleanup === "function" ? themeCleanup : null,
    };
    itemPaneSurfaceRecords.set(body, record);
    return record;
  }

  function detachItemPaneSurfaceRecord(record, { removeContainer = true } = {}) {
    if (!record || typeof record !== "object") {
      return false;
    }

    if (record.mounted) {
      try {
        unmountReactSurface({
          doc: record.container?.ownerDocument || record.body?.ownerDocument || null,
          container: record.container || null,
          rootURI,
          services,
          logger,
        });
      } catch {}
    }

    try {
      record.themeCleanup?.();
    } catch {}

    if (removeContainer && record.container?.parentNode && typeof record.container.parentNode.removeChild === "function") {
      try {
        record.container.parentNode.removeChild(record.container);
      } catch {}
    }

    record.mounted = false;
    if (record.body) {
      itemPaneSurfaceRecords.delete(record.body);
    }
    return true;
  }

  function buildSurfaceTarget(window, presentation = null) {
    if (typeof host?.buildSurfaceTarget !== "function") {
      return null;
    }

    const rootElement = window?.document?.getElementById?.("react-ui-demo-root")
      || window?.document?.documentElement
      || null;

    return host.buildSurfaceTarget({
      surfaceId: "window-shell",
      captureKind: `${config?.addonRef || "cleanroomtemplate"}-react-ui-demo-window`,
      label: "React UI Demo Window",
      element: rootElement,
      window,
      details: {
        bundleId: bundleID,
        presentation: clonePresentation(presentation),
      },
    });
  }

  const shell = createWindowShellManager({
    logger,
    openWindow(context = {}) {
      if (!isEnabled()) {
        throw new Error("Optional bundle `react-ui` is disabled");
      }

      const mainWindow = host?.getMainWindow?.() || null;
      if (!mainWindow) {
        throw new Error("Main Zotero window is unavailable");
      }

      const href = typeof host?.resolveContentUrl === "function"
        ? host.resolveContentUrl("content/react-ui/demo.xhtml")
        : "content/react-ui/demo.xhtml";
      const presentation = context.surfaceWindowModeDecision || null;

      if (typeof mainWindow.openDialog === "function") {
        return mainWindow.openDialog(
          href,
          `${config?.addonRef || "cleanroomtemplate"}-react-ui-demo-${presentation?.effectiveWindowMode || "window"}`,
          "chrome,centerscreen,resizable,width=980,height=720",
        );
      }

      if (typeof mainWindow.open === "function") {
        return mainWindow.open(
          href,
          `${config?.addonRef || "cleanroomtemplate"}-react-ui-demo-${presentation?.effectiveWindowMode || "window"}`,
          "resizable,width=980,height=720",
        );
      }

      throw new Error("Main Zotero window cannot open dialog windows");
    },
    async mountWindow({ window, context }) {
      const cleanups = [];
      const presentation = context?.surfaceWindowModeDecision || null;
      if (typeof themeManager?.mountWindow === "function") {
        cleanups.push(themeManager.mountWindow(window));
      }

      try {
        window?.document?.documentElement?.setAttribute?.(
          "data-addon-ref",
          String(config?.addonRef || "cleanroomtemplate"),
        );
        window?.document?.documentElement?.setAttribute?.(
          "data-addon-name",
          String(config?.addonName || "Cleanroom Template"),
        );
        if (presentation) {
          window?.document?.documentElement?.setAttribute?.(
            "data-window-mode",
            String(presentation.effectiveWindowMode || ""),
          );
          window?.document?.documentElement?.setAttribute?.(
            "data-window-mode-source",
            String(presentation.windowModeSource || ""),
          );
          window?.document?.documentElement?.setAttribute?.(
            "data-surface-kind",
            String(presentation.surfaceKind || ""),
          );
        }
      } catch {}

      return () => {
        while (cleanups.length > 0) {
          const cleanup = cleanups.pop();
          try {
            cleanup();
          } catch {}
        }
      };
    },
  });

  async function openDemoWindow(context = {}) {
    const presentation = context.surfaceWindowModeDecision
      || resolveSurfaceWindowModeDecision({
        preferredWindowMode: context.preferredWindowMode ?? context.windowMode ?? "standalone",
        dockedAvailable: false,
        dockedFallbackReason: String(context.dockedFallbackReason || "").trim() || "window-shell-only",
      });
    const result = await shell.open({
      ...context,
      surfaceWindowModeDecision: presentation,
    });
    const snapshot = rememberPresentation(presentation);
    return {
      ...result,
      href: result.window?.location?.href || null,
      surfaceTarget: buildSurfaceTarget(result.window, snapshot),
      presentation: snapshot,
    };
  }

  function renderItemPaneSurface({
    doc,
    body,
    props = {},
    surfaceWindowModeDecision = null,
    ...context
  } = {}) {
    if (!isEnabled()) {
      if (body) {
        const existingRecord = itemPaneSurfaceRecords.get(body) || null;
        if (existingRecord) {
          detachItemPaneSurfaceRecord(existingRecord);
        }
      }
      return {
        bundleId: bundleID,
        enabled: false,
        mounted: false,
        reason: "disabled",
        presentation: rememberPresentation(null),
      };
    }

    const presentation = surfaceWindowModeDecision || resolvePresentation({
      ...context,
      body,
    });
    const presentationSnapshot = rememberPresentation(presentation);
    if (presentation.effectiveWindowMode !== SURFACE_WINDOW_MODE_DOCKED) {
      return {
        bundleId: bundleID,
        enabled: true,
        mounted: false,
        reason: "window-shell-required",
        presentation: presentationSnapshot,
      };
    }

    const targetDoc = doc || body?.ownerDocument || null;
    if (!targetDoc || !isDockTargetAvailable(body)) {
      return {
        bundleId: bundleID,
        enabled: true,
        mounted: false,
        reason: "body-unavailable",
        presentation: presentationSnapshot,
      };
    }

    const record = ensureItemPaneSurfaceContainer(targetDoc, body);
    if (!record?.container) {
      return {
        bundleId: bundleID,
        enabled: true,
        mounted: false,
        reason: "container-unavailable",
        presentation: presentationSnapshot,
      };
    }

    if (record.container.parentNode !== body) {
      body.appendChild(record.container);
    }
    record.container.dataset.windowMode = presentation.effectiveWindowMode;
    record.container.dataset.windowModeSource = presentation.windowModeSource;
    record.container.dataset.surfaceKind = presentation.surfaceKind;

    const operation = record.mounted ? updateReactSurface : mountReactSurface;
    const result = operation({
      doc: targetDoc,
      container: record.container,
      props: {
        addonRef: config?.addonRef || "cleanroomtemplate",
        addonName: config?.addonName || "Cleanroom Template",
        surfaceWindowMode: presentation.effectiveWindowMode,
        surfaceWindowModeSource: presentation.windowModeSource,
        surfaceKind: presentation.surfaceKind,
        fallback: presentation.fallback,
        fallbackReason: presentation.fallbackReason,
        ...props,
      },
      rootURI,
      services,
      logger,
    });

    if (result.success) {
      record.mounted = true;
      debug("reactUIDemo.itemPaneSurface.rendered", {
        operation: result.operation,
        mountedCount: itemPaneSurfaceRecords.size,
      });
    } else {
      warn("reactUIDemo.itemPaneSurface.renderFailed", {
        operation: result.operation,
        error: result.error,
      });
    }

    return {
      bundleId: bundleID,
      enabled: true,
      mounted: result.success === true,
      container: record.container,
      presentation: presentationSnapshot,
      ...result,
    };
  }

  async function presentSurface(context = {}) {
    if (!isEnabled()) {
      return renderItemPaneSurface(context);
    }

    const presentation = resolvePresentation(context);
    if (presentation.effectiveWindowMode === SURFACE_WINDOW_MODE_DOCKED) {
      return renderItemPaneSurface({
        ...context,
        surfaceWindowModeDecision: presentation,
      });
    }

    if (context.body) {
      unmountItemPaneSurface({
        body: context.body,
      });
    }

    return await openDemoWindow({
      ...context,
      surfaceWindowModeDecision: presentation,
    });
  }

  function unmountItemPaneSurface({ body } = {}) {
    if (body) {
      const record = itemPaneSurfaceRecords.get(body) || null;
      return detachItemPaneSurfaceRecord(record);
    }

    let removedCount = 0;
    Array.from(itemPaneSurfaceRecords.values()).forEach((record) => {
      if (detachItemPaneSurfaceRecord(record)) {
        removedCount += 1;
      }
    });
    return removedCount > 0;
  }

  return {
    isEnabled,
    isOpen() {
      return shell.isOpen();
    },
    async openDemoWindow(context = {}) {
      return await openDemoWindow(context);
    },
    async presentSurface(context = {}) {
      return await presentSurface(context);
    },
    renderItemPaneSurface,
    unmountItemPaneSurface,
    getHostSurfaceCount() {
      return itemPaneSurfaceRecords.size;
    },
    close() {
      unmountItemPaneSurface();
      return shell.close();
    },
    getSnapshot() {
      return {
        bundleId: bundleID,
        enabled: isEnabled(),
        hostSurfaceCount: itemPaneSurfaceRecords.size,
        lastPresentation: clonePresentation(lastPresentation),
        ...shell.getSnapshot(),
      };
    },
  };
}
