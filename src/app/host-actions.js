import {
  getHostActionDescriptor,
  isExecutableHostAction,
  listHostActionDescriptors,
} from "./host-action-catalog.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function toPlainString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function createCheck(name, ok, details = {}) {
  return {
    name,
    ok: Boolean(ok),
    details: details && typeof details === "object"
      ? clone(details)
      : {},
  };
}

function summarizeChecks(checks = []) {
  const list = Array.isArray(checks) ? checks : [];
  const passed = list.filter((entry) => entry?.ok === true).length;
  return {
    ok: list.every((entry) => entry?.ok === true),
    total: list.length,
    passed,
    failed: list.length - passed,
    checks: list,
  };
}

function buildResult({
  actionId,
  preconditions = [],
  observedState = {},
  readinessChecks = [],
  surfaceTarget = null,
  failureKind = null,
}) {
  const readiness = summarizeChecks(readinessChecks);
  const preconditionSummary = summarizeChecks(preconditions);
  return {
    actionId,
    ok: preconditionSummary.ok && readiness.ok && !failureKind,
    preconditions: preconditionSummary.checks,
    observedState: clone(observedState),
    readiness,
    surfaceTarget: surfaceTarget ? clone(surfaceTarget) : null,
    failureKind: failureKind || null,
  };
}

function buildFailureResult(actionId, options = {}) {
  return buildResult({
    actionId,
    preconditions: options.preconditions || [],
    observedState: options.observedState || {},
    readinessChecks: options.readinessChecks || [],
    surfaceTarget: options.surfaceTarget || null,
    failureKind: options.failureKind || "action-failed",
  });
}

function countCoreControls(root) {
  if (!root || typeof root.querySelectorAll !== "function") {
    return 0;
  }
  return root.querySelectorAll("button, checkbox, input, select, textarea, radio, menulist").length;
}

function dispatchMenuCommand(menuElem) {
  if (!menuElem || typeof menuElem.dispatchEvent !== "function") {
    return false;
  }
  const ownerWindow = menuElem.ownerGlobal || menuElem.ownerDocument?.defaultView || null;
  const MouseEventCtor = ownerWindow?.MouseEvent || globalThis.MouseEvent;
  const CommandEventCtor = ownerWindow?.Event || globalThis.Event;
  if (MouseEventCtor) {
    menuElem.dispatchEvent(new MouseEventCtor("click", {
      bubbles: true,
      cancelable: true,
    }));
  }
  if (CommandEventCtor) {
    menuElem.dispatchEvent(new CommandEventCtor("command", {
      bubbles: true,
      cancelable: true,
    }));
  }
  return true;
}

function normalizeTarget(payload = {}) {
  return payload.target ?? payload.itemID ?? payload.tabID ?? null;
}

export function createHostActionRunner({
  config,
  host,
  reader,
  menuManager,
}) {
  async function runPreferencesOpenPane(actionId, payload = {}) {
    const paneID = toPlainString(payload.paneID) || `${config.addonRef}-preferences`;
    const preconditions = [
      createCheck("host.preparePreferencePane", typeof host?.preparePreferencePane === "function"),
      createCheck("paneID", Boolean(paneID), { paneID }),
    ];
    if (preconditions.some((entry) => entry.ok === false)) {
      return buildFailureResult(actionId, {
        preconditions,
        failureKind: "precondition-failed",
      });
    }

    try {
      const prepared = await host.preparePreferencePane({
        paneID,
        scrollTo: toPlainString(payload.scrollTo) || undefined,
        timeoutMs: payload.timeoutMs,
      });
      try {
        prepared.window?.focus?.();
      }
      catch {}
      const coreControlCount = countCoreControls(prepared.paneElement);
      const observedState = {
        paneID,
        selectedPaneID: prepared.selectedPaneID,
        coreControlCount,
        preferenceWindowCount: Array.isArray(host.listPreferenceWindows?.())
          ? host.listPreferenceWindows().length
          : null,
      };
      const readinessChecks = [
        createCheck("selected-pane", prepared.selectedPaneID === paneID, {
          expected: paneID,
          actual: prepared.selectedPaneID,
        }),
        createCheck("pane-root-visible", Boolean(prepared.paneElement)),
        createCheck("core-controls-ready", coreControlCount > 0, {
          coreControlCount,
        }),
      ];
      const surfaceTarget = host.buildSurfaceTarget({
        surfaceId: "preference-pane",
        captureKind: `surface-preference-${paneID}`,
        label: `Preference Pane ${paneID}`,
        element: prepared.paneElement,
        window: prepared.window,
        details: {
          paneID,
        },
      });
      return buildResult({
        actionId,
        preconditions,
        observedState,
        readinessChecks,
        surfaceTarget,
      });
    }
    catch (error) {
      return buildFailureResult(actionId, {
        preconditions,
        observedState: {
          paneID,
          error: String(error?.message || error),
        },
        failureKind: "action-error",
      });
    }
  }

  async function runContextPaneSetOpen(actionId, payload = {}) {
    const open = payload.open !== false;
    const preconditions = [
      createCheck("host.setContextPaneOpen", typeof host?.setContextPaneOpen === "function"),
      createCheck("host.getContextPane", Boolean(host?.getContextPane?.())),
    ];
    if (preconditions.some((entry) => entry.ok === false)) {
      return buildFailureResult(actionId, {
        preconditions,
        failureKind: "precondition-failed",
      });
    }

    try {
      const state = await host.setContextPaneOpen(open, {
        timeoutMs: payload.timeoutMs,
      });
      const window = host.getMainWindow?.() || null;
      try {
        window?.focus?.();
      }
      catch {}
      const contextPane = host.getContextPane?.(window) || null;
      const surfaceTarget = host.buildSurfaceTarget({
        surfaceId: "context-pane",
        captureKind: "surface-context-pane",
        label: "Context Pane",
        element: contextPane?.context || window?.document?.getElementById?.("zotero-context-pane") || null,
        window,
        details: {
          tabID: state?.tabID || null,
        },
      });
      return buildResult({
        actionId,
        preconditions,
        observedState: state || {},
        readinessChecks: [
          createCheck("context-pane-open", Boolean(state?.open) === open, {
            expected: open,
            actual: state?.open,
          }),
        ],
        surfaceTarget,
      });
    }
    catch (error) {
      return buildFailureResult(actionId, {
        preconditions,
        observedState: {
          open,
          error: String(error?.message || error),
        },
        failureKind: "action-error",
      });
    }
  }

  async function runItemPaneSelectPane(actionId, payload = {}) {
    const paneID = toPlainString(payload.paneID);
    const preconditions = [
      createCheck("paneID", Boolean(paneID), { paneID }),
      createCheck("host.selectItemPane", typeof host?.selectItemPane === "function"),
    ];
    if (preconditions.some((entry) => entry.ok === false)) {
      return buildFailureResult(actionId, {
        preconditions,
        failureKind: "precondition-failed",
      });
    }

    try {
      const result = await host.selectItemPane(paneID, {
        behavior: toPlainString(payload.behavior) || "instant",
        timeoutMs: payload.timeoutMs,
      });
      try {
        host.getMainWindow?.()?.focus?.();
      }
      catch {}
      const surfaceTarget = host.buildSurfaceTarget({
        surfaceId: "item-pane-sidenav",
        captureKind: `surface-item-pane-${paneID}`,
        label: `Item Pane ${paneID}`,
        element: result.pane,
        window: host.getMainWindow?.() || null,
        details: {
          paneID,
        },
      });
      return buildResult({
        actionId,
        preconditions,
        observedState: {
          paneID,
          visible: Boolean(result.visible),
        },
        readinessChecks: [
          createCheck("pane-visible", Boolean(result.visible), {
            paneID,
          }),
        ],
        surfaceTarget,
      });
    }
    catch (error) {
      return buildFailureResult(actionId, {
        preconditions,
        observedState: {
          paneID,
          error: String(error?.message || error),
        },
        failureKind: "action-error",
      });
    }
  }

  async function runContextPaneSelectPane(actionId, payload = {}) {
    const paneID = toPlainString(payload.paneID);
    const tabID = toPlainString(payload.tabID);
    const preconditions = [
      createCheck("paneID", Boolean(paneID), { paneID }),
      createCheck("host.selectContextPane", typeof host?.selectContextPane === "function"),
    ];
    if (preconditions.some((entry) => entry.ok === false)) {
      return buildFailureResult(actionId, {
        preconditions,
        failureKind: "precondition-failed",
      });
    }

    try {
      const result = await host.selectContextPane(paneID, {
        tabID,
        behavior: toPlainString(payload.behavior) || "instant",
        timeoutMs: payload.timeoutMs,
      });
      try {
        host.getMainWindow?.()?.focus?.();
      }
      catch {}
      const surfaceTarget = host.buildSurfaceTarget({
        surfaceId: "context-pane",
        captureKind: `surface-context-pane-${paneID}`,
        label: `Context Pane ${paneID}`,
        element: result.pane,
        window: host.getMainWindow?.() || null,
        details: {
          paneID,
          tabID: result.tabID || null,
        },
      });
      return buildResult({
        actionId,
        preconditions,
        observedState: {
          paneID,
          tabID: result.tabID || tabID,
          visible: Boolean(result.visible),
        },
        readinessChecks: [
          createCheck("pane-visible", Boolean(result.visible), {
            paneID,
            tabID: result.tabID || tabID,
          }),
        ],
        surfaceTarget,
      });
    }
    catch (error) {
      return buildFailureResult(actionId, {
        preconditions,
        observedState: {
          paneID,
          tabID,
          error: String(error?.message || error),
        },
        failureKind: "action-error",
      });
    }
  }

  async function runReaderOpen(actionId, payload = {}) {
    const itemID = Number(payload.itemID);
    const preconditions = [
      createCheck("itemID", Number.isFinite(itemID), { itemID }),
      createCheck("reader.openReader", typeof reader?.openReader === "function"),
      createCheck("reader.waitForReaderReady", typeof reader?.waitForReaderReady === "function"),
    ];
    if (preconditions.some((entry) => entry.ok === false)) {
      return buildFailureResult(actionId, {
        preconditions,
        failureKind: "precondition-failed",
      });
    }

    try {
      if (typeof reader?.canOpen === "function") {
        const canOpen = await reader.canOpen(itemID);
        if (!canOpen) {
          return buildFailureResult(actionId, {
            preconditions: [
              ...preconditions,
              createCheck("reader-capable-attachment", false, { itemID }),
            ],
            observedState: { itemID },
            failureKind: "unsupported-target",
          });
        }
      }

      const instance = await reader.openReader({
        itemID,
        location: payload.location,
        openInBackground: payload.openInBackground === true,
        openInWindow: payload.openInWindow === true,
        allowDuplicate: payload.allowDuplicate === true,
      });
      const readyReader = await reader.waitForReaderReady(instance || itemID, {
        timeoutMs: payload.timeoutMs,
      });
      const summary = reader.getReaderSummary(readyReader || itemID);
      const frameWindow = reader.getReaderFrameWindow(readyReader || itemID);
      try {
        frameWindow?.focus?.();
        frameWindow?.top?.focus?.();
      }
      catch {}
      const surfaceTarget = host.buildSurfaceTarget({
        surfaceId: "reader-window",
        captureKind: `surface-reader-window-${itemID}`,
        label: `Reader ${itemID}`,
        element: frameWindow?.document?.documentElement || null,
        window: frameWindow || null,
        details: {
          itemID,
          tabID: summary?.tabID || null,
        },
      });
      return buildResult({
        actionId,
        preconditions,
        observedState: summary || { itemID },
        readinessChecks: [
          createCheck("reader-summary", Boolean(summary?.itemID === itemID), {
            expected: itemID,
            actual: summary?.itemID ?? null,
          }),
          createCheck("reader-frame-window", Boolean(frameWindow)),
        ],
        surfaceTarget,
      });
    }
    catch (error) {
      return buildFailureResult(actionId, {
        preconditions,
        observedState: {
          itemID,
          error: String(error?.message || error),
        },
        failureKind: "action-error",
      });
    }
  }

  async function runReaderContextPaneSetOpen(actionId, payload = {}) {
    const open = payload.open !== false;
    const target = normalizeTarget(payload);
    const preconditions = [
      createCheck("reader.setContextPaneOpen", typeof reader?.setContextPaneOpen === "function"),
      createCheck("reader-target", target !== null && target !== undefined, { target }),
    ];
    if (preconditions.some((entry) => entry.ok === false)) {
      return buildFailureResult(actionId, {
        preconditions,
        failureKind: "precondition-failed",
      });
    }

    try {
      const snapshot = await reader.setContextPaneOpen(target, open, {
        timeoutMs: payload.timeoutMs,
      });
      const window = host.getMainWindow?.() || null;
      try {
        window?.focus?.();
      }
      catch {}
      const contextPane = host.getContextPane?.(window) || null;
      const surfaceTarget = host.buildSurfaceTarget({
        surfaceId: "context-pane",
        captureKind: "surface-reader-context-pane",
        label: "Reader Context Pane",
        element: contextPane?.context || window?.document?.getElementById?.("zotero-context-pane") || null,
        window,
        details: {
          target,
        },
      });
      return buildResult({
        actionId,
        preconditions,
        observedState: snapshot || {},
        readinessChecks: [
          createCheck("reader-context-pane-open", snapshot?.contextPaneOpen === null || snapshot?.contextPaneOpen === open, {
            expected: open,
            actual: snapshot?.contextPaneOpen ?? null,
          }),
        ],
        surfaceTarget,
      });
    }
    catch (error) {
      return buildFailureResult(actionId, {
        preconditions,
        observedState: {
          target,
          open,
          error: String(error?.message || error),
        },
        failureKind: "action-error",
      });
    }
  }

  async function runReaderSidebarSelectView(actionId, payload = {}) {
    const target = normalizeTarget(payload);
    const view = toPlainString(payload.view);
    const preconditions = [
      createCheck("reader.selectSidebarView", typeof reader?.selectSidebarView === "function"),
      createCheck("reader-target", target !== null && target !== undefined, { target }),
      createCheck("view", Boolean(view), { view }),
    ];
    if (preconditions.some((entry) => entry.ok === false)) {
      return buildFailureResult(actionId, {
        preconditions,
        failureKind: "precondition-failed",
      });
    }

    try {
      const result = await reader.selectSidebarView(target, view, {
        timeoutMs: payload.timeoutMs,
      });
      const surfaceElement = result?.panel || result?.button || null;
      try {
        surfaceElement?.ownerGlobal?.focus?.();
        surfaceElement?.ownerDocument?.defaultView?.focus?.();
      }
      catch {}
      const surfaceTarget = host.buildSurfaceTarget({
        surfaceId: "reader-sidebar-view",
        captureKind: `surface-reader-sidebar-${view}`,
        label: `Reader Sidebar ${view}`,
        element: surfaceElement,
        window: surfaceElement?.ownerGlobal || surfaceElement?.ownerDocument?.defaultView || null,
        details: {
          view,
          target,
        },
      });
      return buildResult({
        actionId,
        preconditions,
        observedState: {
          view,
          sidebarView: result?.uiState?.sidebarView ?? null,
          sidebarOpen: result?.uiState?.sidebarOpen ?? null,
          buttonFound: Boolean(result?.button),
          panelFound: Boolean(result?.panel),
        },
        readinessChecks: [
          createCheck("sidebar-view-selected", result?.uiState?.sidebarView === view, {
            expected: view,
            actual: result?.uiState?.sidebarView ?? null,
          }),
          createCheck("sidebar-surface-observed", Boolean(result?.button || result?.panel), {
            view,
          }),
        ],
        surfaceTarget,
      });
    }
    catch (error) {
      return buildFailureResult(actionId, {
        preconditions,
        observedState: {
          target,
          view,
          error: String(error?.message || error),
        },
        failureKind: "action-error",
      });
    }
  }

  async function runMenuShow(actionId, payload = {}) {
    const menuID = toPlainString(payload.menuID);
    const target = toPlainString(payload.target);
    const menuPath = toPlainString(payload.menuPath);
    const preconditions = [
      createCheck("menuID", Boolean(menuID), { menuID }),
      createCheck("target", Boolean(target), { target }),
      createCheck("host.resolveMenuPopup", typeof host?.resolveMenuPopup === "function"),
      createCheck("menuManager.getMenuRegistrationSnapshot", typeof menuManager?.getMenuRegistrationSnapshot === "function"),
    ];
    if (preconditions.some((entry) => entry.ok === false)) {
      return buildFailureResult(actionId, {
        preconditions,
        failureKind: "precondition-failed",
      });
    }

    const registration = menuManager.getMenuRegistrationSnapshot(menuID);
    if (!registration) {
      return buildFailureResult(actionId, {
        preconditions: [
          ...preconditions,
          createCheck("menu-registered", false, { menuID }),
        ],
        observedState: {
          menuID,
          target,
        },
        failureKind: "not-found",
      });
    }

    try {
      const popupResolver = await host.resolveMenuPopup(target, {
        reader: payload.reader || null,
        rowSelector: payload.rowSelector || null,
        tabID: payload.tabID || null,
      });
      const popup = await popupResolver.open();
      try {
        popup?.ownerGlobal?.focus?.();
        popup?.ownerDocument?.defaultView?.focus?.();
      }
      catch {}
      const liveState = await host.waitFor(
        () => menuManager.getLiveMenuState(menuID, menuPath),
        {
          timeoutMs: payload.timeoutMs ?? 5000,
          intervalMs: 50,
          message: `Timed out waiting for live menu state for ${menuID}`,
        },
      );
      const surfaceTarget = host.buildSurfaceTarget({
        surfaceId: "menu-item",
        captureKind: `surface-menu-${target}-${menuID}`,
        label: `Menu ${menuID}`,
        element: liveState?.menuElem || popup,
        window: (liveState?.menuElem?.ownerGlobal || popup?.ownerGlobal || popup?.ownerDocument?.defaultView || null),
        details: {
          menuID,
          target,
          menuPath: menuPath || null,
        },
      });
      return buildResult({
        actionId,
        preconditions: [
          ...preconditions,
          createCheck("menu-registered", true, {
            target: registration.target,
            menuPaths: registration.menuPaths || [],
          }),
        ],
        observedState: {
          menuID,
          target,
          menuPath: liveState?.menuPath || menuPath || null,
          phase: liveState?.phase || null,
          itemCount: liveState?.itemCount ?? null,
          tabID: liveState?.tabID ?? null,
          tabType: liveState?.tabType ?? null,
          popupOpen: Boolean(popup),
        },
        readinessChecks: [
          createCheck("popup-open", Boolean(popup)),
          createCheck("menu-element-visible", Boolean(liveState?.menuElem), {
            menuID,
          }),
        ],
        surfaceTarget,
      });
    }
    catch (error) {
      return buildFailureResult(actionId, {
        preconditions,
        observedState: {
          menuID,
          target,
          error: String(error?.message || error),
        },
        failureKind: "action-error",
      });
    }
  }

  async function runMenuTrigger(actionId, payload = {}) {
    const menuID = toPlainString(payload.menuID);
    const target = toPlainString(payload.target);
    const menuPath = toPlainString(payload.menuPath);
    const showResult = await runMenuShow("menu.show", {
      ...payload,
      menuID,
      target,
      menuPath,
    });
    if (!showResult.ok) {
      return buildFailureResult(actionId, {
        preconditions: showResult.preconditions || [],
        observedState: showResult.observedState || {},
        readinessChecks: Array.isArray(showResult.readiness?.checks) ? showResult.readiness.checks : [],
        surfaceTarget: showResult.surfaceTarget,
        failureKind: showResult.failureKind || "precondition-failed",
      });
    }

    const liveState = menuManager.getLiveMenuState(menuID, menuPath);
    const dispatched = dispatchMenuCommand(liveState?.menuElem);
    return buildResult({
      actionId,
      preconditions: showResult.preconditions || [],
      observedState: {
        ...(showResult.observedState || {}),
        commandDispatched: dispatched,
      },
      readinessChecks: [
        ...(Array.isArray(showResult.readiness?.checks) ? showResult.readiness.checks : []),
        createCheck("command-dispatched", dispatched, {
          menuID,
        }),
      ],
      surfaceTarget: showResult.surfaceTarget,
    });
  }

  async function runHostAction(actionId, payload = {}) {
    const descriptor = getHostActionDescriptor(actionId);
    if (!descriptor) {
      return buildFailureResult(String(actionId || "unknown"), {
        failureKind: "unknown-action",
      });
    }
    if (!isExecutableHostAction(actionId)) {
      return buildFailureResult(actionId, {
        observedState: {
          status: descriptor.status,
        },
        failureKind: "not-executable",
      });
    }

    switch (actionId) {
      case "preferences.openPane":
        return await runPreferencesOpenPane(actionId, payload);
      case "contextPane.setOpen":
        return await runContextPaneSetOpen(actionId, payload);
      case "itemPane.selectPane":
        return await runItemPaneSelectPane(actionId, payload);
      case "contextPane.selectPane":
        return await runContextPaneSelectPane(actionId, payload);
      case "reader.open":
        return await runReaderOpen(actionId, payload);
      case "reader.contextPane.setOpen":
        return await runReaderContextPaneSetOpen(actionId, payload);
      case "reader.sidebar.selectView":
        return await runReaderSidebarSelectView(actionId, payload);
      case "menu.show":
        return await runMenuShow(actionId, payload);
      case "menu.trigger":
        return await runMenuTrigger(actionId, payload);
      default:
        return buildFailureResult(actionId, {
          failureKind: "unsupported-action",
        });
    }
  }

  return {
    listHostActions() {
      return listHostActionDescriptors();
    },
    async runHostAction(actionId, payload = {}) {
      return await runHostAction(actionId, payload);
    },
  };
}
