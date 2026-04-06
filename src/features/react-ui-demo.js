import { createWindowShellManager } from "../utils/window-shell.js";

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
} = {}) {
  const bundleID = "react-ui";

  function isEnabled() {
    return isOptionalBundleEnabled(optionalBundles, bundleID);
  }

  function buildSurfaceTarget(window) {
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
      },
    });
  }

  const shell = createWindowShellManager({
    logger,
    openWindow() {
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

      if (typeof mainWindow.openDialog === "function") {
        return mainWindow.openDialog(
          href,
          `${config?.addonRef || "cleanroomtemplate"}-react-ui-demo`,
          "chrome,centerscreen,resizable,width=980,height=720",
        );
      }

      if (typeof mainWindow.open === "function") {
        return mainWindow.open(
          href,
          `${config?.addonRef || "cleanroomtemplate"}-react-ui-demo`,
          "resizable,width=980,height=720",
        );
      }

      throw new Error("Main Zotero window cannot open dialog windows");
    },
    async mountWindow({ window }) {
      const cleanups = [];
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
    const result = await shell.open(context);
    return {
      ...result,
      href: result.window?.location?.href || null,
      surfaceTarget: buildSurfaceTarget(result.window),
    };
  }

  return {
    isEnabled,
    isOpen() {
      return shell.isOpen();
    },
    async openDemoWindow(context = {}) {
      return await openDemoWindow(context);
    },
    close() {
      return shell.close();
    },
    getSnapshot() {
      return {
        bundleId: bundleID,
        enabled: isEnabled(),
        ...shell.getSnapshot(),
      };
    },
  };
}
