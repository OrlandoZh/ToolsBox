(function bootstrapCleanroomPreferencePaneLoadBridge() {
  const LOAD_API_KEY = "__CLEANROOM_PREFERENCE_PANE_LOAD_API__";
  const DEBUG_STATE_KEY = "__CLEANROOM_PREFERENCE_PANE_LOAD_BRIDGE_STATE__";

  function getScopeDocument() {
    return globalThis?.document || window?.document || null;
  }

  function getPreferenceWindow() {
    const scopeDocument = getScopeDocument();
    if (scopeDocument?.defaultView) {
      return scopeDocument.defaultView;
    }
    if (typeof window === "object" && window) {
      return window;
    }
    return globalThis;
  }

  function getPreferences(preferenceWindow) {
    return preferenceWindow?.Zotero_Preferences || globalThis.Zotero_Preferences || null;
  }

  function findCurrentPane(preferences) {
    const panes = preferences?.panes || null;
    if (panes && typeof panes.values === "function") {
      for (const pane of panes.values()) {
        if (pane?.scope === globalThis) {
          return pane;
        }
      }
    }

    const selectedPaneID = typeof preferences?.navigation?.value === "string"
      ? preferences.navigation.value.trim()
      : "";
    if (selectedPaneID && panes && typeof panes.get === "function") {
      return panes.get(selectedPaneID) || null;
    }

    return null;
  }

  function isPaneLoadTarget(target, pane) {
    const container = pane?.container || null;
    if (!container || !target) {
      return false;
    }
    if (target === container || target.parentNode === container) {
      return true;
    }
    if (typeof container.contains === "function") {
      try {
        return container.contains(target);
      }
      catch {}
    }
    return false;
  }

  function isPaneMounted(pane) {
    const container = pane?.container || null;
    if (!container) {
      return false;
    }
    if (Number.isFinite(Number(container.childElementCount)) && Number(container.childElementCount) > 0) {
      return true;
    }
    if (Array.isArray(container.children) && container.children.length > 0) {
      return true;
    }
    if (typeof container.querySelector === "function") {
      try {
        if (container.querySelector("*")) {
          return true;
        }
      }
      catch {}
    }
    return false;
  }

  function createDebugState() {
    return {
      booted: true,
      foundPreferenceWindow: false,
      foundPreferences: false,
      foundPane: false,
      paneID: null,
      selectedPaneID: null,
      mountedObserved: false,
      loadEventObserved: false,
      invokeAttempted: false,
      invokeCompleted: false,
      apiFound: false,
    };
  }

  function setDebugState(target, state) {
    if (!target || typeof target !== "object") {
      return;
    }
    target[DEBUG_STATE_KEY] = state;
  }

  const preferenceWindow = getPreferenceWindow();
  const debugState = createDebugState();
  debugState.foundPreferenceWindow = Boolean(preferenceWindow);
  setDebugState(globalThis, debugState);
  setDebugState(preferenceWindow, debugState);
  const preferences = getPreferences(preferenceWindow);
  debugState.foundPreferences = Boolean(preferences);
  const pane = findCurrentPane(preferences);
  debugState.foundPane = Boolean(pane);
  debugState.paneID = pane?.id || null;
  debugState.selectedPaneID = typeof preferences?.navigation?.value === "string"
    ? preferences.navigation.value.trim() || null
    : null;
  if (!pane || !preferenceWindow?.document?.addEventListener) {
    return;
  }

  let invoked = false;
  let observer = null;
  let pollHandle = null;
  let loadListenerAttached = false;

  function cleanupWatchers() {
    if (observer && typeof observer.disconnect === "function") {
      try {
        observer.disconnect();
      }
      catch {}
    }
    observer = null;

    if (loadListenerAttached) {
      try {
        preferenceWindow.document.removeEventListener("load", onPaneLoad, true);
      }
      catch {}
      loadListenerAttached = false;
    }

    const clearTimer = preferenceWindow?.clearTimeout || globalThis?.clearTimeout || null;
    if (pollHandle !== null && typeof clearTimer === "function") {
      try {
        clearTimer(pollHandle);
      }
      catch {}
    }
    pollHandle = null;
  }

  function invokeLoadBridge(waitUntil = null) {
    if (invoked) {
      return null;
    }

    invoked = true;
    debugState.invokeAttempted = true;
    cleanupWatchers();

    const api = preferenceWindow?.Services?.[LOAD_API_KEY]
      || globalThis.Services?.[LOAD_API_KEY]
      || preferenceWindow?.Zotero?.[LOAD_API_KEY]
      || globalThis.Zotero?.[LOAD_API_KEY]
      || null;
    debugState.apiFound = Boolean(api && typeof api.invoke === "function");
    if (!api || typeof api.invoke !== "function") {
      return null;
    }

    const result = api.invoke({
      window: preferenceWindow,
      paneID: pane.id,
      pluginID: pane.pluginID,
    });
    debugState.invokeCompleted = true;
    if (typeof waitUntil === "function" && result && typeof result.then === "function") {
      waitUntil(result);
    }
    return result;
  }

  function invokeLoadBridgeForTarget(target, waitUntil = null) {
    if (!isPaneLoadTarget(target, pane)) {
      return null;
    }
    return invokeLoadBridge(waitUntil);
  }

  function tryInvokeMountedPane() {
    if (!isPaneMounted(pane)) {
      return null;
    }
    debugState.mountedObserved = true;
    return invokeLoadBridge();
  }

  const onPaneLoad = function onPaneLoad(event) {
    debugState.loadEventObserved = true;
    invokeLoadBridgeForTarget(event?.target || null, event?.waitUntil);
  };

  preferenceWindow.document.addEventListener("load", onPaneLoad, true);
  loadListenerAttached = true;

  const MutationObserverCtor = preferenceWindow?.MutationObserver || globalThis?.MutationObserver || null;
  if (typeof MutationObserverCtor === "function" && pane?.container) {
    observer = new MutationObserverCtor(() => {
      tryInvokeMountedPane();
    });
    try {
      observer.observe(pane.container, {
        childList: true,
        subtree: true,
      });
    }
    catch {
      observer = null;
    }
  }

  Promise.resolve().then(() => {
    if (tryInvokeMountedPane() || invoked) {
      return;
    }

    const scheduleTimer = preferenceWindow?.setTimeout || globalThis?.setTimeout || null;
    if (typeof scheduleTimer !== "function") {
      return;
    }

    let attempts = 0;
    const poll = () => {
      if (tryInvokeMountedPane() || invoked) {
        return;
      }
      attempts += 1;
      if (attempts >= 40) {
        cleanupWatchers();
        return;
      }
      pollHandle = scheduleTimer(poll, 25);
    };
    pollHandle = scheduleTimer(poll, 25);
  });
})();
