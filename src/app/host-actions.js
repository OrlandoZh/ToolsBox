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

function getCollectionCount(collection) {
  if (!collection) {
    return 0;
  }
  return Number.isFinite(Number(collection.length))
    ? Number(collection.length)
    : 0;
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

function countSelectorMatches(root, selector) {
  if (!root || typeof root.querySelectorAll !== "function") {
    return 0;
  }
  try {
    return getCollectionCount(root.querySelectorAll(selector));
  }
  catch {
    return 0;
  }
}

function countSurfaceMatches(root, selector) {
  return countSelectorMatches(root, selector) + (elementMatchesSelector(root, selector) ? 1 : 0);
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

function resolvePreferenceTabID(element) {
  return readElementAttribute(element, [
    "data-pref-tab",
    "data-tab-id",
    "data-tab",
    "id",
    "value",
  ]);
}

function resolvePreferencePanelID(element) {
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

function resolvePreferenceInteractiveRootElement(prepared) {
  const paneElement = prepared?.paneElement || null;
  if (!paneElement) {
    return {
      root: null,
      strategy: null,
    };
  }

  const paneID = String(prepared?.paneID || prepared?.selectedPaneID || readElementAttribute(paneElement, ["id"]) || "").trim() || null;
  const candidateRootID = paneID ? `${paneID}-root` : null;
  if (candidateRootID) {
    if (readElementAttribute(paneElement, ["id"]) === candidateRootID) {
      return {
        root: paneElement,
        strategy: "pane-root-id",
      };
    }
    const explicitRoot = safeQuery(paneElement, `#${candidateRootID}`);
    if (explicitRoot) {
      return {
        root: explicitRoot,
        strategy: "pane-root-id",
      };
    }
  }

  if (elementMatchesSelector(paneElement, "[data-pref-root]")) {
    return {
      root: paneElement,
      strategy: "data-pref-root",
    };
  }
  const dataPrefRoot = safeQuery(paneElement, "[data-pref-root]");
  if (dataPrefRoot) {
    return {
      root: dataPrefRoot,
      strategy: "data-pref-root",
    };
  }

  if (readElementAttribute(paneElement, ["data-active-tab"])) {
    return {
      root: paneElement,
      strategy: "active-tab-root",
    };
  }
  const activeTabRoot = safeQuery(paneElement, "[data-active-tab]");
  if (activeTabRoot) {
    return {
      root: activeTabRoot,
      strategy: "active-tab-root",
    };
  }

  return {
    root: paneElement,
    strategy: "pane-container",
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

function inspectPreferenceTabState(prepared) {
  const rootResolution = resolvePreferenceInteractiveRootElement(prepared);
  const root = rootResolution.root;
  const tabs = collectPreferenceTabs(root);
  const panels = collectPreferencePanels(root);
  const rootActiveTabID = readElementAttribute(root, ["data-active-tab"]);
  const activeTabElement = rootActiveTabID
    ? tabs.find((element) => resolvePreferenceTabID(element) === rootActiveTabID) || null
    : tabs.find((element) => {
      return readElementBooleanState(element, [
        "selected",
        "checked",
        "aria-selected",
      ]) || hasClassToken(element, "is-active") || hasClassToken(element, "active");
    }) || null;
  const activeTabID = rootActiveTabID || resolvePreferenceTabID(activeTabElement);
  const visiblePanels = panels.filter((element) => isVisiblePreferencePanel(element));

  let activePanelElement = null;
  const activeTabControls = readElementAttribute(activeTabElement, ["aria-controls"]);
  if (activeTabControls) {
    activePanelElement = panels.find((element) => readElementAttribute(element, ["id"]) === activeTabControls) || null;
  }
  if (!activePanelElement && activeTabID) {
    activePanelElement = panels.find((element) => {
      return [
        resolvePreferencePanelID(element),
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

  const panelCoreControlCount = activePanelElement
    ? countSelectorMatches(
      activePanelElement,
      "button, checkbox, input, select, textarea, radio, menulist, toolbarbutton",
    )
    : 0;

  return {
    interactiveRoot: root,
    interactiveRootStrategy: rootResolution.strategy,
    hasInteractiveRoot: Boolean(root) && (
      rootResolution.strategy !== "pane-container"
      || tabs.length > 0
      || panels.length > 0
    ),
    tabCount: tabs.length,
    panelCount: panels.length,
    tabs,
    panels,
    activeTabElement,
    activeTabID: activeTabID || null,
    activePanelElement,
    activePanelID: resolvePreferencePanelID(activePanelElement),
    visiblePanelCount: visiblePanels.length,
    panelCoreControlCount,
  };
}

function inspectElementSurface(element) {
  const rootTagName = typeof element?.localName === "string" && element.localName.trim()
    ? element.localName.trim()
    : typeof element?.tagName === "string" && element.tagName.trim()
      ? element.tagName.trim().toLowerCase()
      : null;
  const rootNamespaceURI = typeof element?.namespaceURI === "string" && element.namespaceURI.trim()
    ? element.namespaceURI.trim()
    : null;
  const childElementCount = Number.isFinite(Number(element?.childElementCount))
    ? Number(element.childElementCount)
    : getCollectionCount(element?.children);
  const descendantElementCount = countSelectorMatches(element, "*");
  const interactiveCount = countSurfaceMatches(
    element,
    "button, checkbox, input, select, textarea, radio, menulist, toolbarbutton, menuitem, [role='button'], [role='tab'], [role='menuitem'], [tabindex]",
  );
  const headingCount = countSurfaceMatches(
    element,
    "caption, legend, label[class*='header'], .header, [data-l10n-id*='heading'], h1, h2, h3, html\\:h1, html\\:h2, html\\:h3",
  );
  const descriptionCount = countSurfaceMatches(
    element,
    "description, .description, p, html\\:p",
  );
  const menuItemCount = countSurfaceMatches(
    element,
    "menuitem, [role='menuitem']",
  );
  const tabCount = countSurfaceMatches(
    element,
    "[role='tab']",
  );
  const selectedCount = countSurfaceMatches(
    element,
    "[aria-selected='true'], [selected='true'], [checked='true'], [aria-checked='true']",
  );
  const label = readElementAttribute(element, [
    "label",
    "value",
    "aria-label",
    "title",
    "tooltiptext",
    "data-l10n-id",
  ]);
  const role = readElementAttribute(element, ["role"]);
  const paneID = readElementAttribute(element, [
    "data-pane",
    "data-view",
    "data-sidebar-view",
    "data-panel",
  ]);
  const l10nID = readElementAttribute(element, ["data-l10n-id"]);
  const textLength = typeof element?.textContent === "string"
    ? element.textContent.replace(/\s+/g, " ").trim().length
    : 0;
  const hidden = readElementBooleanState(element, ["hidden", "collapsed", "aria-hidden"]);
  const disabled = readElementBooleanState(element, ["disabled", "aria-disabled"]);

  return {
    rootTagName,
    rootNamespaceURI,
    childElementCount,
    descendantElementCount,
    interactiveCount,
    headingCount,
    descriptionCount,
    menuItemCount,
    tabCount,
    selectedCount,
    textLength,
    label,
    role,
    paneID,
    l10nID,
    hidden,
    disabled,
  };
}

function hasSurfaceStructure(snapshot = {}) {
  return Number(snapshot.childElementCount) > 0 || Number(snapshot.descendantElementCount) > 0;
}

function hasSurfaceContent(snapshot = {}) {
  return [
    snapshot.interactiveCount,
    snapshot.headingCount,
    snapshot.descriptionCount,
    snapshot.menuItemCount,
    snapshot.tabCount,
    snapshot.textLength,
    snapshot.selectedCount,
  ].some((value) => Number(value) > 0);
}

function isActionableSurface(snapshot = {}) {
  return snapshot.hidden !== true && snapshot.disabled !== true;
}

function normalizeActivationPolicy(value) {
  return value === "ui-required" ? "ui-required" : "host-first";
}

function isLiveClickActivationStrategy(value) {
  return value === "click" || value === "dispatch-click";
}

function applyActivationObservedState(observedState = {}, options = {}) {
  return {
    ...observedState,
    activationPolicy: normalizeActivationPolicy(options.activationPolicy),
    activationStrategy: toPlainString(options.activationStrategy),
    actionElementObserved: Boolean(options.actionElementObserved),
    actionDispatched: Boolean(options.actionDispatched),
  };
}

function normalizeEdgeBounds(bounds = {}) {
  const width = Number(bounds?.width);
  if (!Number.isFinite(width) || width <= 0) {
    return null;
  }

  const x = Number(bounds?.x);
  const y = Number(bounds?.y);
  const height = Number(bounds?.height);
  return {
    x: Number.isFinite(x) ? Math.round(x) : null,
    y: Number.isFinite(y) ? Math.round(y) : null,
    width: Math.round(width),
    height: Number.isFinite(height) && height > 0 ? Math.round(height) : null,
  };
}

function buildWindowAnchoredEdgeBounds({
  edgeMode = null,
  windowBounds = null,
  width = null,
} = {}) {
  const normalizedWindowBounds = normalizeEdgeBounds(windowBounds);
  const normalizedWidth = Number.isFinite(Number(width)) && Number(width) > 0
    ? Math.round(Number(width))
    : null;
  if (!normalizedWindowBounds || normalizedWidth === null) {
    return null;
  }

  const anchorRight = toPlainString(edgeMode) === "pane-attached";
  const x = anchorRight
    ? normalizedWindowBounds.x + Math.max(0, normalizedWindowBounds.width - normalizedWidth)
    : normalizedWindowBounds.x;

  return {
    x,
    y: normalizedWindowBounds.y,
    width: normalizedWidth,
    height: normalizedWindowBounds.height,
  };
}

function buildEdgeAttachmentState({
  edgeMode = null,
  surfaceTarget = null,
  minimumViableWidth = null,
  fallbackWidth = null,
  fallbackSource = null,
  active = true,
} = {}) {
  const normalizedEdgeMode = toPlainString(edgeMode);
  const normalizedMinimumWidth = Number.isFinite(Number(minimumViableWidth)) && Number(minimumViableWidth) > 0
    ? Math.round(Number(minimumViableWidth))
    : null;

  if (!active || !normalizedEdgeMode) {
    return {
      edgeMode: normalizedEdgeMode,
      boundsSource: null,
      bounds: null,
      minimumViableWidth: normalizedMinimumWidth,
      degradedReason: null,
    };
  }

  let bounds = normalizeEdgeBounds(surfaceTarget?.rect || null);
  let boundsSource = bounds
    ? toPlainString(surfaceTarget?.rect?.source) || "surface-target-rect"
    : null;

  if (!bounds && Number.isFinite(Number(fallbackWidth)) && Number(fallbackWidth) > 0) {
    const windowAnchoredBounds = buildWindowAnchoredEdgeBounds({
      edgeMode: normalizedEdgeMode,
      windowBounds: surfaceTarget?.windowBounds || null,
      width: fallbackWidth,
    });
    if (windowAnchoredBounds) {
      bounds = windowAnchoredBounds;
      boundsSource = `${toPlainString(fallbackSource) || "state-width"}+window-bounds`;
    } else {
      bounds = {
        x: null,
        y: null,
        width: Math.round(Number(fallbackWidth)),
        height: null,
      };
      boundsSource = toPlainString(fallbackSource) || "state-width";
    }
  }

  let degradedReason = null;
  if (!bounds || !boundsSource) {
    degradedReason = "bounds-unavailable";
  } else if (normalizedMinimumWidth !== null && bounds.width < normalizedMinimumWidth) {
    degradedReason = "width-below-minimum";
  }

  return {
    edgeMode: normalizedEdgeMode,
    boundsSource,
    bounds,
    minimumViableWidth: normalizedMinimumWidth,
    degradedReason,
  };
}

function hasExplicitEdgeAttachmentHandling(snapshot = {}) {
  return snapshot?.degradedReason === null || snapshot?.degradedReason === "width-below-minimum";
}

function attachEdgeStateToSurfaceTarget(surfaceTarget, edgeState = {}) {
  if (!surfaceTarget || typeof surfaceTarget !== "object") {
    return surfaceTarget;
  }

  if (!surfaceTarget.rect) {
    const normalizedEdgeRect = normalizeEdgeBounds(edgeState?.bounds || null);
    if (
      normalizedEdgeRect
      && Number.isFinite(normalizedEdgeRect.x)
      && Number.isFinite(normalizedEdgeRect.y)
      && Number.isFinite(normalizedEdgeRect.width)
      && Number.isFinite(normalizedEdgeRect.height)
    ) {
      surfaceTarget.rect = {
        ...normalizedEdgeRect,
        title: toPlainString(surfaceTarget?.windowBounds?.title) || null,
        source: edgeState.boundsSource || null,
      };
    }
  }

  surfaceTarget.details = {
    ...(surfaceTarget.details && typeof surfaceTarget.details === "object" ? surfaceTarget.details : {}),
    edgeMode: edgeState.edgeMode || null,
    boundsSource: edgeState.boundsSource || null,
    minimumViableWidth: edgeState.minimumViableWidth ?? null,
    degradedReason: edgeState.degradedReason || null,
  };
  return surfaceTarget;
}

function findPaneButton(root, paneID) {
  if (!root || typeof root.querySelectorAll !== "function" || !paneID) {
    return null;
  }
  try {
    const candidates = root.querySelectorAll(".btn[data-pane], [data-pane]");
    for (const candidate of candidates) {
      if (candidate?.dataset?.pane === paneID) {
        return candidate;
      }
    }
  }
  catch {}
  return null;
}

function dispatchMenuCommand(menuElem) {
  if (!menuElem || typeof menuElem.dispatchEvent !== "function") {
    return {
      activationStrategy: null,
      actionDispatched: false,
    };
  }
  const ownerWindow = menuElem.ownerGlobal || menuElem.ownerDocument?.defaultView || null;
  const MouseEventCtor = ownerWindow?.MouseEvent || globalThis.MouseEvent;
  const CommandEventCtor = ownerWindow?.Event || globalThis.Event;
  if (MouseEventCtor) {
    menuElem.dispatchEvent(new MouseEventCtor("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      detail: 1,
    }));
  }
  if (CommandEventCtor) {
    menuElem.dispatchEvent(new CommandEventCtor("command", {
      bubbles: true,
      cancelable: true,
    }));
  }
  return {
    activationStrategy: CommandEventCtor ? "command" : MouseEventCtor ? "click" : null,
    actionDispatched: Boolean(MouseEventCtor || CommandEventCtor),
  };
}

function triggerLiveElement(element) {
  if (!element) {
    return {
      activationStrategy: null,
      actionDispatched: false,
    };
  }

  if (typeof element.doCommand === "function") {
    element.doCommand();
    return {
      activationStrategy: "command",
      actionDispatched: true,
    };
  }

  if (typeof element.click === "function") {
    element.click();
    return {
      activationStrategy: "click",
      actionDispatched: true,
    };
  }

  if (typeof element.dispatchEvent === "function") {
    const ownerWindow = element.ownerGlobal || element.ownerDocument?.defaultView || null;
    const MouseEventCtor = ownerWindow?.MouseEvent || globalThis.MouseEvent;
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

  return {
    activationStrategy: null,
    actionDispatched: false,
  };
}

function normalizeTarget(payload = {}) {
  return payload.target ?? payload.itemID ?? payload.tabID ?? null;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForValue(getter, options = {}) {
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : 2000;
  const intervalMs = Number.isFinite(Number(options.intervalMs)) ? Number(options.intervalMs) : 50;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = await getter();
    if (value) {
      return value;
    }
    await sleep(intervalMs);
  }

  return null;
}

function isElementWithin(root, element) {
  if (!root || !element) {
    return false;
  }
  if (root === element) {
    return true;
  }
  if (typeof root.contains === "function") {
    try {
      return root.contains(element);
    }
    catch {}
  }

  let current = element.parentNode || null;
  while (current) {
    if (current === root) {
      return true;
    }
    current = current.parentNode || null;
  }
  return false;
}

function safeQuery(root, selector) {
  if (!root || typeof root.querySelector !== "function" || !selector) {
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
  if (!root || typeof root.querySelectorAll !== "function" || !selector) {
    return [];
  }
  try {
    return Array.from(root.querySelectorAll(selector));
  }
  catch {
    return [];
  }
}

function readReaderSidebarDomOpen(result = {}) {
  const doc = result?.doc || result?.button?.ownerDocument || result?.panel?.ownerDocument || null;
  if (!doc) {
    return null;
  }

  const outerContainer = safeQuery(doc, "#outerContainer");
  if (outerContainer && hasClassToken(outerContainer, "sidebarOpen")) {
    return true;
  }

  const sidebarToggleButton = safeQuery(doc, "#sidebarToggleButton");
  if (sidebarToggleButton) {
    if (hasClassToken(sidebarToggleButton, "toggled")) {
      return true;
    }
    if (readElementBooleanState(sidebarToggleButton, ["aria-expanded", "aria-pressed"])) {
      return true;
    }
  }

  return null;
}

function getDocumentFromPreferencePane(prepared) {
  return prepared?.window?.document || prepared?.paneElement?.ownerDocument || null;
}

function getControlKind(control) {
  const localName = toPlainString(control?.localName)
    || toPlainString(control?.tagName)?.toLowerCase()
    || null;
  const inputType = toPlainString(control?.type)?.toLowerCase() || null;
  if (localName === "checkbox" || (localName === "input" && inputType === "checkbox")) {
    return "checkbox";
  }
  if (localName === "textbox" || localName === "textarea" || localName === "input") {
    return "textbox";
  }
  if (localName === "menulist" || localName === "select") {
    return "menulist";
  }
  return "unknown";
}

function readCheckboxState(control) {
  if (typeof control?.checked === "boolean") {
    return control.checked;
  }
  return readElementBooleanState(control, ["checked", "aria-checked"]);
}

function setCheckboxState(control, checked) {
  if (!control || typeof checked !== "boolean") {
    return;
  }
  if ("checked" in control) {
    control.checked = checked;
  }
  if (typeof control.setAttribute === "function") {
    if (checked) {
      control.setAttribute("checked", "true");
    } else {
      control.removeAttribute?.("checked");
    }
  }
}

function readTextboxValue(control) {
  if (control && control.value !== undefined && control.value !== null) {
    return String(control.value);
  }
  return readElementAttribute(control, ["value"]) || "";
}

function setTextboxValue(control, value) {
  if (!control) {
    return;
  }
  if ("value" in control) {
    control.value = String(value);
  }
  if (typeof control.setAttribute === "function") {
    control.setAttribute("value", String(value));
  }
}

function readMenulistValue(control) {
  if (control && control.value !== undefined && control.value !== null) {
    return String(control.value);
  }
  const selectedItemValue = control?.selectedItem?.value
    || control?.selectedItem?.getAttribute?.("value")
    || null;
  return selectedItemValue ? String(selectedItemValue) : readElementAttribute(control, ["value"]) || "";
}

function findMenulistOption(control, value) {
  const desiredValue = String(value);
  return safeQueryAll(control, "menuitem, option").find((item) => {
    const candidate = item?.value ?? item?.getAttribute?.("value");
    return String(candidate || "") === desiredValue;
  }) || null;
}

function setMenulistValue(control, value) {
  const stringValue = String(value);
  const selectedItem = findMenulistOption(control, stringValue);
  if ("value" in control) {
    control.value = stringValue;
  }
  if (typeof control.setAttribute === "function") {
    control.setAttribute("value", stringValue);
  }
  if ("selectedItem" in control && selectedItem) {
    control.selectedItem = selectedItem;
  }
  return selectedItem;
}

function readControlState(control, kind) {
  if (kind === "checkbox") {
    return readCheckboxState(control);
  }
  if (kind === "menulist") {
    return readMenulistValue(control);
  }
  return readTextboxValue(control);
}

function isControlVisible(control) {
  return !readElementBooleanState(control, ["hidden", "collapsed", "aria-hidden"])
    && !readElementBooleanState(control, ["disabled", "aria-disabled"]);
}

function createElementEvent(element, type, preferredCtor = "Event", init = {}) {
  const ownerWindow = element?.ownerGlobal || element?.ownerDocument?.defaultView || globalThis;
  const EventCtor = ownerWindow?.[preferredCtor]
    || ownerWindow?.Event
    || globalThis?.[preferredCtor]
    || globalThis?.Event;
  if (typeof EventCtor === "function") {
    try {
      return new EventCtor(type, {
        bubbles: true,
        cancelable: true,
        ...init,
      });
    }
    catch {}
  }
  return {
    type,
    bubbles: true,
    cancelable: true,
    ...init,
  };
}

function dispatchElementEvent(element, type, preferredCtor = "Event", init = {}) {
  if (!element || typeof element.dispatchEvent !== "function") {
    return false;
  }
  try {
    element.dispatchEvent(createElementEvent(element, type, preferredCtor, init));
    return true;
  }
  catch {
    return false;
  }
}

function driveCheckboxControl(control, checked) {
  const before = readCheckboxState(control);
  if (before !== checked) {
    if (typeof control?.click === "function") {
      control.click();
      return {
        activationStrategy: "click",
        actionDispatched: true,
      };
    }
    if (typeof control?.doCommand === "function") {
      control.doCommand();
      return {
        activationStrategy: "command",
        actionDispatched: true,
      };
    }
    setCheckboxState(control, checked);
    const clickDispatched = dispatchElementEvent(control, "click", "MouseEvent", {
      button: 0,
      detail: 1,
    });
    const commandDispatched = dispatchElementEvent(control, "command");
    return {
      activationStrategy: clickDispatched && commandDispatched
        ? "dispatch-click-command"
        : clickDispatched
          ? "dispatch-click"
          : commandDispatched
            ? "dispatch-command"
            : null,
      actionDispatched: clickDispatched || commandDispatched,
    };
  }

  setCheckboxState(control, checked);
  const commandDispatched = dispatchElementEvent(control, "command");
  const changeDispatched = dispatchElementEvent(control, "change");
  return {
    activationStrategy: commandDispatched && changeDispatched
      ? "command-change"
      : commandDispatched
        ? "command"
        : changeDispatched
          ? "change"
          : null,
    actionDispatched: commandDispatched || changeDispatched,
  };
}

function driveTextboxControl(control, value) {
  control?.focus?.();
  setTextboxValue(control, value);
  const inputDispatched = dispatchElementEvent(control, "input", "Event");
  const changeDispatched = dispatchElementEvent(control, "change", "Event");
  return {
    activationStrategy: inputDispatched && changeDispatched
      ? "input-change"
      : inputDispatched
        ? "input"
        : changeDispatched
          ? "change"
          : null,
    actionDispatched: inputDispatched || changeDispatched,
  };
}

function driveMenulistControl(control, value) {
  control?.focus?.();
  setMenulistValue(control, value);
  const commandDispatched = dispatchElementEvent(control, "command", "Event");
  const changeDispatched = dispatchElementEvent(control, "change", "Event");
  return {
    activationStrategy: commandDispatched && changeDispatched
      ? "command-change"
      : commandDispatched
        ? "command"
        : changeDispatched
          ? "change"
          : null,
    actionDispatched: commandDispatched || changeDispatched,
  };
}

function buildPreferenceLocator(payload = {}) {
  return {
    controlID: toPlainString(payload.controlID),
    preferenceID: toPlainString(payload.preferenceID),
    selector: toPlainString(payload.selector),
  };
}

function getPreferenceDefinitionElement(prepared, preferenceID = null) {
  if (!preferenceID) {
    return null;
  }
  const doc = getDocumentFromPreferencePane(prepared);
  if (!doc || typeof doc.getElementById !== "function") {
    return null;
  }
  const definition = doc.getElementById(preferenceID);
  return isElementWithin(prepared?.paneElement || null, definition) ? definition : definition;
}

function findPreferenceControl(prepared, locator = {}) {
  const paneElement = prepared?.paneElement || null;
  const doc = getDocumentFromPreferencePane(prepared);
  if (!paneElement) {
    return {
      control: null,
      matchedBy: null,
      preferenceDefinition: null,
    };
  }

  if (locator.controlID && doc && typeof doc.getElementById === "function") {
    const control = doc.getElementById(locator.controlID);
    if (isElementWithin(paneElement, control)) {
      return {
        control,
        matchedBy: "controlID",
        preferenceDefinition: null,
      };
    }
  }

  const preferenceDefinition = getPreferenceDefinitionElement(prepared, locator.preferenceID);
  if (locator.preferenceID) {
    const prefName = preferenceDefinition?.getAttribute?.("name")
      || preferenceDefinition?.name
      || null;
    const control = safeQuery(
      paneElement,
      prefName
        ? `[preference="${prefName}"], [preference="${locator.preferenceID}"]`
        : `[preference="${locator.preferenceID}"]`,
    );
    if (control) {
      return {
        control,
        matchedBy: "preferenceID",
        preferenceDefinition,
      };
    }
  }

  if (locator.selector) {
    const control = safeQuery(paneElement, locator.selector);
    if (control) {
      return {
        control,
        matchedBy: "selector",
        preferenceDefinition,
      };
    }
  }

  return {
    control: null,
    matchedBy: null,
    preferenceDefinition,
  };
}

function resolvePreferenceBinding(prepared, control, locator = {}, expectedKind = "textbox") {
  const preferenceDefinition = getPreferenceDefinitionElement(prepared, locator.preferenceID);
  const attrValue = readElementAttribute(control, ["preference"]);
  let prefName = attrValue && attrValue.includes(".") ? attrValue : null;

  let effectiveDefinition = preferenceDefinition;
  if (!effectiveDefinition && attrValue) {
    effectiveDefinition = getPreferenceDefinitionElement(prepared, attrValue);
  }
  if (!prefName && effectiveDefinition) {
    prefName = effectiveDefinition.getAttribute?.("name") || effectiveDefinition.name || null;
  }

  const preferenceType = toPlainString(
    effectiveDefinition?.getAttribute?.("type") || effectiveDefinition?.type,
  ) || (expectedKind === "checkbox" ? "bool" : "string");

  return {
    preferenceDefinition: effectiveDefinition,
    prefName,
    preferenceType,
  };
}

function readPreferenceValue(preferenceWindow, prefName, preferenceType, expectedKind = "textbox") {
  if (!prefName) {
    return null;
  }
  const services = preferenceWindow?.Services || globalThis.Services || null;
  if (!services?.prefs) {
    return null;
  }
  try {
    if (preferenceType === "bool" || expectedKind === "checkbox") {
      return Boolean(services.prefs.getBoolPref(prefName, false));
    }
    return String(services.prefs.getStringPref(prefName, ""));
  }
  catch {
    return null;
  }
}

function resolvePreferenceThemeRootElement(paneElement) {
  if (!paneElement) {
    return {
      root: null,
      strategy: null,
    };
  }

  if (elementMatchesSelector(paneElement, ".cleanroom-pref-root")) {
    return {
      root: paneElement,
      strategy: "pane-root-class",
    };
  }

  const descendantRoot = safeQuery(paneElement, ".cleanroom-pref-root");
  if (descendantRoot) {
    return {
      root: descendantRoot,
      strategy: "descendant-root-class",
    };
  }

  let ancestor = paneElement?.parentNode || null;
  while (ancestor) {
    if (elementMatchesSelector(ancestor, ".cleanroom-pref-root")) {
      return {
        root: ancestor,
        strategy: "ancestor-root-class",
      };
    }
    ancestor = ancestor.parentNode || null;
  }

  return {
    root: null,
    strategy: null,
  };
}

function valuesMatch(actual, expected, kind) {
  if (kind === "checkbox") {
    return Boolean(actual) === Boolean(expected);
  }
  return String(actual ?? "") === String(expected ?? "");
}

function readThemeState(paneElement) {
  const rootResolution = resolvePreferenceThemeRootElement(paneElement);
  const root = rootResolution.root;
  const dataset = root?.dataset && typeof root.dataset === "object" ? root.dataset : {};
  return {
    paneThemeMode: dataset.cleanroomThemeMode || readElementAttribute(root, ["data-cleanroom-theme-mode"]),
    paneTheme: dataset.cleanroomTheme || readElementAttribute(root, ["data-cleanroom-theme"]),
    themeRootFound: Boolean(root),
    themeRootStrategy: rootResolution.strategy,
  };
}

function isThemeModePreferenceControl(locator = {}, binding = {}, control = null) {
  const prefName = toPlainString(binding?.prefName)?.toLowerCase() || null;
  const preferenceID = toPlainString(locator?.preferenceID)?.toLowerCase() || null;
  const controlID = toPlainString(locator?.controlID)?.toLowerCase() || null;
  const selector = toPlainString(locator?.selector)?.toLowerCase() || null;
  const resolvedControlID = toPlainString(control?.id)?.toLowerCase() || null;

  return Boolean(
    prefName?.endsWith(".thememode")
    || preferenceID === "pref-thememode"
    || controlID?.includes("theme-mode")
    || resolvedControlID?.includes("theme-mode")
    || selector?.includes("theme-mode")
  );
}

function buildExpectedThemeState(expectedValue) {
  const paneThemeMode = toPlainString(expectedValue);
  if (!paneThemeMode) {
    return null;
  }
  return {
    paneThemeMode,
    paneTheme: paneThemeMode === "dark" || paneThemeMode === "light"
      ? paneThemeMode
      : null,
  };
}

function doesThemeStateMatch(themeState, expectedThemeState = null) {
  if (!expectedThemeState) {
    return true;
  }
  if (String(themeState?.paneThemeMode || "") !== expectedThemeState.paneThemeMode) {
    return false;
  }
  if (expectedThemeState.paneTheme) {
    return String(themeState?.paneTheme || "") === expectedThemeState.paneTheme;
  }
  return Boolean(toPlainString(themeState?.paneTheme));
}

function buildPreferenceControlSurfaceTarget(host, prepared, control, locator, fallbackDetails = {}) {
  const paneID = prepared?.selectedPaneID || prepared?.paneID || null;
  const captureToken = locator.controlID || locator.preferenceID || locator.selector || "control";
  const hasControlRect = typeof host?.getElementScreenRect === "function"
    ? Boolean(host.getElementScreenRect(control))
    : false;
  return host.buildSurfaceTarget({
    surfaceId: "preference-control",
    captureKind: `preference-control-${paneID}-${captureToken}`,
    label: `Preference Control ${captureToken}`,
    element: hasControlRect ? control : prepared?.paneElement || null,
    window: prepared?.window || null,
    details: {
      paneID,
      controlID: locator.controlID || null,
      preferenceID: locator.preferenceID || null,
      selector: locator.selector || null,
      controlSurfaceFallback: !hasControlRect,
      ...fallbackDetails,
    },
  });
}

export function createHostActionRunner({
  config,
  host,
  reader,
  menuManager,
  itemPane,
  optionalBundles,
  openReactDemoWindow,
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
      const preferenceSurface = prepared.preferenceSurface && typeof prepared.preferenceSurface === "object"
        ? prepared.preferenceSurface
        : {};
      const coreControlCount = Number.isFinite(Number(preferenceSurface.coreControlCount))
        ? Number(preferenceSurface.coreControlCount)
        : 0;
      const childElementCount = Number.isFinite(Number(preferenceSurface.childElementCount))
        ? Number(preferenceSurface.childElementCount)
        : 0;
      const tabCount = Number.isFinite(Number(preferenceSurface.tabCount))
        ? Number(preferenceSurface.tabCount)
        : 0;
      const panelCount = Number.isFinite(Number(preferenceSurface.panelCount))
        ? Number(preferenceSurface.panelCount)
        : 0;
      const visiblePanelCount = Number.isFinite(Number(preferenceSurface.visiblePanelCount))
        ? Number(preferenceSurface.visiblePanelCount)
        : 0;
      const panelCoreControlCount = Number.isFinite(Number(preferenceSurface.panelCoreControlCount))
        ? Number(preferenceSurface.panelCoreControlCount)
        : 0;
      const advancedPaneObserved = tabCount > 0 || panelCount > 0 || preferenceSurface.hasInteractiveRoot === true;
      const paneStructureObserved = [
        preferenceSurface.groupboxCount,
        preferenceSurface.headingCount,
        preferenceSurface.descriptionCount,
        preferenceSurface.coreControlCount,
        preferenceSurface.panelCoreControlCount,
      ].some((value) => Number(value) > 0);
      const paneBehaviorSignatureObserved = [
        preferenceSurface.coreControlCount,
        preferenceSurface.preferenceBindingCount,
        preferenceSurface.preferenceDefinitionCount,
        preferenceSurface.localizationLinkCount,
        preferenceSurface.scriptTagCount,
        preferenceSurface.registeredScriptCount,
        preferenceSurface.registeredStylesheetCount,
        preferenceSurface.tabCount,
        preferenceSurface.panelCount,
        preferenceSurface.panelCoreControlCount,
      ].some((value) => Number(value) > 0)
        || preferenceSurface.hasInlineLoadHook === true
        || preferenceSurface.hasLoadBridgeSignature === true;
      const observedState = {
        paneID,
        selectedPaneID: prepared.selectedPaneID,
        coreControlCount,
        preferenceWindowCount: Array.isArray(host.listPreferenceWindows?.())
          ? host.listPreferenceWindows().length
          : null,
        preferenceSurface,
        surfaceGeometrySettle: prepared.surfaceGeometrySettle || null,
      };
      const surfaceElement = prepared.surfaceElement || prepared.paneElement;
      const readinessChecks = [
        createCheck("selected-pane", prepared.selectedPaneID === paneID, {
          expected: paneID,
          actual: prepared.selectedPaneID,
        }),
        createCheck("pane-root-visible", Boolean(prepared.paneElement)),
        createCheck("pane-fragment-mounted", childElementCount > 0, {
          childElementCount,
        }),
        createCheck("pane-structure-observed", paneStructureObserved, {
          groupboxCount: Number(preferenceSurface.groupboxCount) || 0,
          headingCount: Number(preferenceSurface.headingCount) || 0,
          descriptionCount: Number(preferenceSurface.descriptionCount) || 0,
          coreControlCount,
          panelCoreControlCount,
        }),
        createCheck("pane-behavior-signature-observed", paneBehaviorSignatureObserved, {
          coreControlCount,
          preferenceBindingCount: Number(preferenceSurface.preferenceBindingCount) || 0,
          preferenceDefinitionCount: Number(preferenceSurface.preferenceDefinitionCount) || 0,
          localizationLinkCount: Number(preferenceSurface.localizationLinkCount) || 0,
          scriptTagCount: Number(preferenceSurface.scriptTagCount) || 0,
          registeredScriptCount: Number(preferenceSurface.registeredScriptCount) || 0,
          registeredStylesheetCount: Number(preferenceSurface.registeredStylesheetCount) || 0,
          hasInlineLoadHook: preferenceSurface.hasInlineLoadHook === true,
        }),
        createCheck("interactive-root-observed", advancedPaneObserved ? preferenceSurface.hasInteractiveRoot === true : true, {
          advancedPaneObserved,
          interactiveRootStrategy: preferenceSurface.interactiveRootStrategy || null,
        }),
        createCheck("active-tab-observed", tabCount > 0 ? Boolean(preferenceSurface.activeTabID) : true, {
          tabCount,
          activeTabID: preferenceSurface.activeTabID || null,
        }),
        createCheck("active-panel-observed", panelCount > 0 ? Boolean(preferenceSurface.activePanelID) || visiblePanelCount === 1 : true, {
          panelCount,
          activePanelID: preferenceSurface.activePanelID || null,
          visiblePanelCount,
        }),
        createCheck("active-panel-content-observed", panelCount > 0 ? panelCoreControlCount > 0 : true, {
          panelCount,
          panelCoreControlCount,
        }),
      ];
      const surfaceTarget = host.buildSurfaceTarget({
        surfaceId: "preference-pane",
        captureKind: `surface-preference-${paneID}`,
        label: `Preference Pane ${paneID}`,
        element: surfaceElement,
        window: prepared.window,
        details: {
          paneID,
          surfaceRootStrategy: prepared.surfaceElementStrategy || null,
          geometrySettled: prepared.surfaceGeometrySettle?.stable === true,
          surfaceGeometry: prepared.surfaceGeometrySettle?.geometry || null,
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

  async function runPreferencesSelectTab(actionId, payload = {}) {
    const paneID = toPlainString(payload.paneID) || `${config.addonRef}-preferences`;
    const tabID = toPlainString(payload.tabID);
    const preconditions = [
      createCheck("host.preparePreferencePane", typeof host?.preparePreferencePane === "function"),
      createCheck("paneID", Boolean(paneID), { paneID }),
      createCheck("tabID", Boolean(tabID), { tabID }),
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
        timeoutMs: payload.timeoutMs,
      });
      try {
        prepared.window?.focus?.();
      }
      catch {}

      const beforeState = inspectPreferenceTabState(prepared);
      const tabElement = beforeState.tabs.find((element) => resolvePreferenceTabID(element) === tabID) || null;
      if (!tabElement) {
        return buildFailureResult(actionId, {
          preconditions,
          observedState: {
            paneID,
            requestedTabID: tabID,
            selectedPaneID: prepared.selectedPaneID,
            tabCount: beforeState.tabCount,
            panelCount: beforeState.panelCount,
          },
          readinessChecks: [
            createCheck("interactive-root-observed", beforeState.hasInteractiveRoot, {
              interactiveRootStrategy: beforeState.interactiveRootStrategy,
            }),
            createCheck("tab-observed", false, {
              tabID,
              tabCount: beforeState.tabCount,
            }),
          ],
          failureKind: "tab-not-found",
        });
      }

      const activation = triggerLiveElement(tabElement);
      const waitForObservedState = typeof host?.waitFor === "function"
        ? async (getter, waitOptions) => {
          try {
            return await host.waitFor(getter, waitOptions);
          }
          catch {
            return null;
          }
        }
        : async (getter, waitOptions) => {
          return await waitForValue(getter, waitOptions);
        };

      const timeoutMs = Number.isFinite(Number(payload.timeoutMs)) ? Number(payload.timeoutMs) : 2000;
      const settled = await waitForObservedState(
        () => {
          const current = inspectPreferenceTabState(prepared);
          const activeTabMatched = current.activeTabID === tabID;
          const activePanelObserved = current.panelCount > 0
            ? Boolean(current.activePanelID) || current.visiblePanelCount === 1
            : true;
          const activePanelContentObserved = current.panelCount > 0
            ? current.panelCoreControlCount > 0
            : true;
          return activeTabMatched && activePanelObserved && activePanelContentObserved
            ? current
            : null;
        },
        {
          timeoutMs,
          intervalMs: 50,
          message: `Timed out waiting for preference tab '${tabID}'`,
        },
      );

      const finalState = settled || inspectPreferenceTabState(prepared);
      const activeTabMatched = finalState.activeTabID === tabID;
      const activePanelObserved = finalState.panelCount > 0
        ? Boolean(finalState.activePanelID) || finalState.visiblePanelCount === 1
        : true;
      const activePanelContentObserved = finalState.panelCount > 0
        ? finalState.panelCoreControlCount > 0
        : true;
      const surfaceTarget = host.buildSurfaceTarget({
        surfaceId: "preference-pane",
        captureKind: `preference-tab-${paneID}-${tabID}`,
        label: `Preference Tab ${tabID}`,
        element: finalState.activePanelElement || tabElement || prepared.paneElement,
        window: prepared.window,
        details: {
          paneID,
          tabID,
          activePanelID: finalState.activePanelID || null,
        },
      });
      const readinessChecks = [
        createCheck("selected-pane", prepared.selectedPaneID === paneID, {
          expected: paneID,
          actual: prepared.selectedPaneID,
        }),
        createCheck("interactive-root-observed", finalState.hasInteractiveRoot, {
          interactiveRootStrategy: finalState.interactiveRootStrategy,
        }),
        createCheck("tab-observed", Boolean(tabElement), {
          tabID,
          tabCount: finalState.tabCount,
        }),
        createCheck("activation-strategy-observed", Boolean(activation.activationStrategy), {
          activationStrategy: activation.activationStrategy,
        }),
        createCheck("action-dispatched", activation.actionDispatched, {
          activationStrategy: activation.activationStrategy,
        }),
        createCheck("active-tab-matched", activeTabMatched, {
          expected: tabID,
          actual: finalState.activeTabID,
        }),
        createCheck("active-panel-observed", activePanelObserved, {
          panelCount: finalState.panelCount,
          activePanelID: finalState.activePanelID || null,
          visiblePanelCount: finalState.visiblePanelCount,
        }),
        createCheck("active-panel-content-observed", activePanelContentObserved, {
          panelCount: finalState.panelCount,
          panelCoreControlCount: finalState.panelCoreControlCount,
        }),
      ];

      let failureKind = null;
      if (!activation.actionDispatched) {
        failureKind = "action-dispatch-failed";
      }
      else if (!activeTabMatched) {
        failureKind = "tab-selection-mismatch";
      }
      else if (!activePanelObserved) {
        failureKind = "tab-panel-missing";
      }
      else if (!activePanelContentObserved) {
        failureKind = "tab-panel-empty";
      }

      return buildResult({
        actionId,
        preconditions,
        observedState: {
          paneID,
          selectedPaneID: prepared.selectedPaneID,
          requestedTabID: tabID,
          activeTabID: finalState.activeTabID,
          activePanelID: finalState.activePanelID,
          tabCount: finalState.tabCount,
          panelCount: finalState.panelCount,
          visiblePanelCount: finalState.visiblePanelCount,
          panelCoreControlCount: finalState.panelCoreControlCount,
        },
        readinessChecks,
        surfaceTarget,
        failureKind,
      });
    }
    catch (error) {
      return buildFailureResult(actionId, {
        preconditions,
        observedState: {
          paneID,
          requestedTabID: tabID,
          error: String(error?.message || error),
        },
        failureKind: "action-error",
      });
    }
  }

  async function runPreferenceControlAction(actionId, payload = {}, kind) {
    const paneID = toPlainString(payload.paneID) || `${config.addonRef}-preferences`;
    const locator = buildPreferenceLocator(payload);
    const hasLocator = Boolean(locator.controlID || locator.preferenceID || locator.selector);
    const expectedValue = kind === "checkbox"
      ? payload.checked
      : payload.value !== undefined && payload.value !== null
        ? String(payload.value)
        : null;
    const preconditions = [
      createCheck("host.preparePreferencePane", typeof host?.preparePreferencePane === "function"),
      createCheck("locator", hasLocator, locator),
      createCheck(
        kind === "checkbox" ? "checked" : "value",
        kind === "checkbox" ? typeof payload.checked === "boolean" : expectedValue !== null,
        {
          expectedValue,
        },
      ),
    ];
    if (preconditions.some((entry) => entry.ok === false)) {
      return buildFailureResult(actionId, {
        preconditions,
        observedState: {
          paneID,
          locator,
        },
        failureKind: "precondition-failed",
      });
    }

    try {
      const prepared = await host.preparePreferencePane({
        paneID,
        timeoutMs: payload.timeoutMs,
      });
      try {
        prepared.window?.focus?.();
      }
      catch {}

      const located = findPreferenceControl(prepared, locator);
      const control = located.control || null;
      const controlKind = getControlKind(control);
      const binding = resolvePreferenceBinding(prepared, control, locator, kind);
      const valueBefore = control ? readControlState(control, kind) : null;
      const prefValueBefore = readPreferenceValue(
        prepared?.window || null,
        binding.prefName,
        binding.preferenceType,
        kind,
      );
      const controlVisible = control ? isControlVisible(control) : false;

      if (!control) {
        return buildFailureResult(actionId, {
          preconditions,
          observedState: {
            paneID,
            locator,
            matchedBy: located.matchedBy,
          },
          readinessChecks: [
            createCheck("control-observed", false, {
              paneID,
              locator,
            }),
          ],
          failureKind: "control-not-found",
        });
      }

      if (controlKind !== kind) {
        return buildFailureResult(actionId, {
          preconditions,
          observedState: {
            paneID,
            locator,
            matchedBy: located.matchedBy,
            controlKind,
          },
          readinessChecks: [
            createCheck("control-observed", true, {
              paneID,
              locator,
            }),
            createCheck("control-type-matched", false, {
              expected: kind,
              actual: controlKind,
            }),
          ],
          failureKind: "control-type-mismatch",
        });
      }

      if (!controlVisible) {
        return buildFailureResult(actionId, {
          preconditions,
          observedState: {
            paneID,
            locator,
            matchedBy: located.matchedBy,
            controlKind,
          },
          readinessChecks: [
            createCheck("control-observed", true, {
              paneID,
              locator,
            }),
            createCheck("control-visible", false, {
              paneID,
              locator,
            }),
          ],
          failureKind: "control-not-interactable",
        });
      }

      let activation = {
        activationStrategy: null,
        actionDispatched: false,
      };
      if (kind === "checkbox") {
        activation = driveCheckboxControl(control, Boolean(expectedValue));
      } else if (kind === "menulist") {
        activation = driveMenulistControl(control, expectedValue);
      } else {
        activation = driveTextboxControl(control, expectedValue);
      }

      const timeoutMs = Number.isFinite(Number(payload.timeoutMs)) ? Number(payload.timeoutMs) : 2000;
      const waitForObservedState = typeof host?.waitFor === "function"
        ? async (getter, waitOptions) => {
          try {
            return await host.waitFor(getter, waitOptions);
          }
          catch {
            return null;
          }
        }
        : async (getter, waitOptions) => {
          return await waitForValue(getter, waitOptions);
        };

      const settled = await waitForObservedState(
        () => {
          const currentValue = readControlState(control, kind);
          const currentPrefValue = readPreferenceValue(
            prepared?.window || null,
            binding.prefName,
            binding.preferenceType,
            kind,
          );
          const stateMatched = valuesMatch(currentValue, expectedValue, kind);
          const prefMatched = valuesMatch(currentPrefValue, expectedValue, kind);
          return stateMatched && prefMatched
            ? {
              valueAfter: currentValue,
              prefValueAfter: currentPrefValue,
            }
            : null;
        },
        {
          timeoutMs,
          intervalMs: 50,
          message: `Timed out waiting for preference writeback for '${binding.prefName || locator.controlID || locator.preferenceID || locator.selector}'`,
        },
      );

      const valueAfter = settled?.valueAfter ?? readControlState(control, kind);
      const prefValueAfter = settled?.prefValueAfter ?? readPreferenceValue(
        prepared?.window || null,
        binding.prefName,
        binding.preferenceType,
        kind,
      );
      const controlStateMatched = valuesMatch(valueAfter, expectedValue, kind);
      const prefWritebackMatched = valuesMatch(prefValueAfter, expectedValue, kind);
      const expectedThemeState = kind === "menulist" && isThemeModePreferenceControl(locator, binding, control)
        ? buildExpectedThemeState(expectedValue)
        : null;
      const themeState = expectedThemeState
        ? await waitForObservedState(
          () => {
            const currentThemeState = readThemeState(prepared?.paneElement || null);
            return doesThemeStateMatch(currentThemeState, expectedThemeState)
              ? currentThemeState
              : null;
          },
          {
            timeoutMs,
            intervalMs: 50,
            message: `Timed out waiting for preference theme sync for '${binding.prefName || locator.controlID || locator.preferenceID || locator.selector}'`,
          },
        ) || readThemeState(prepared?.paneElement || null)
        : readThemeState(prepared?.paneElement || null);
      const themeModeMatched = expectedThemeState
        ? String(themeState?.paneThemeMode || "") === expectedThemeState.paneThemeMode
        : true;
      const themeAppliedMatched = expectedThemeState?.paneTheme
        ? String(themeState?.paneTheme || "") === expectedThemeState.paneTheme
        : true;
      const surfaceTarget = buildPreferenceControlSurfaceTarget(
        host,
        prepared,
        control,
        locator,
        {
          matchedBy: located.matchedBy,
        },
      );
      const observedState = {
        paneID,
        selectedPaneID: prepared.selectedPaneID,
        locator,
        matchedBy: located.matchedBy,
        controlKind,
        valueBefore,
        valueAfter,
        prefName: binding.prefName,
        prefType: binding.preferenceType,
        prefValueBefore,
        prefValueAfter,
        ...themeState,
        controlSurfaceFallback: surfaceTarget?.details?.controlSurfaceFallback === true,
      };
      const readinessChecks = [
        createCheck("selected-pane", prepared.selectedPaneID === paneID, {
          expected: paneID,
          actual: prepared.selectedPaneID,
        }),
        createCheck("control-observed", true, {
          paneID,
          locator,
          matchedBy: located.matchedBy,
        }),
        createCheck("control-visible", controlVisible, {
          paneID,
          locator,
        }),
        createCheck("preference-binding-observed", Boolean(binding.prefName), {
          paneID,
          locator,
          prefName: binding.prefName,
        }),
        createCheck("activation-strategy-observed", Boolean(activation.activationStrategy), {
          activationStrategy: activation.activationStrategy,
        }),
        createCheck("action-dispatched", activation.actionDispatched, {
          activationStrategy: activation.activationStrategy,
        }),
        createCheck("control-state-matched", controlStateMatched, {
          expected: expectedValue,
          actual: valueAfter,
        }),
        createCheck("pref-writeback-matched", prefWritebackMatched, {
          prefName: binding.prefName,
          expected: expectedValue,
          actual: prefValueAfter,
        }),
      ];
      if (expectedThemeState) {
        readinessChecks.push(
          createCheck("pane-theme-root-observed", themeState.themeRootFound === true, {
            themeRootStrategy: themeState.themeRootStrategy,
          }),
        );
        readinessChecks.push(
          createCheck("pane-theme-mode-matched", themeModeMatched, {
            expected: expectedThemeState.paneThemeMode,
            actual: themeState.paneThemeMode,
            themeRootStrategy: themeState.themeRootStrategy,
          }),
        );
        if (expectedThemeState.paneTheme) {
          readinessChecks.push(
            createCheck("pane-theme-applied", themeAppliedMatched, {
              expected: expectedThemeState.paneTheme,
              actual: themeState.paneTheme,
              themeRootStrategy: themeState.themeRootStrategy,
            }),
          );
        }
      }

      let failureKind = null;
      if (!binding.prefName) {
        failureKind = "preference-binding-missing";
      } else if (!activation.actionDispatched) {
        failureKind = "action-dispatch-failed";
      } else if (!controlStateMatched) {
        failureKind = "control-state-mismatch";
      } else if (!prefWritebackMatched) {
        failureKind = "writeback-mismatch";
      } else if (!themeModeMatched || !themeAppliedMatched) {
        failureKind = "theme-state-mismatch";
      }

      return buildResult({
        actionId,
        preconditions,
        observedState: applyActivationObservedState(observedState, {
          activationPolicy: "host-first",
          activationStrategy: activation.activationStrategy,
          actionElementObserved: true,
          actionDispatched: activation.actionDispatched,
        }),
        readinessChecks,
        surfaceTarget,
        failureKind,
      });
    }
    catch (error) {
      return buildFailureResult(actionId, {
        preconditions,
        observedState: {
          paneID,
          locator,
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
      const contextRoot = contextPane?.context || window?.document?.getElementById?.("zotero-context-pane") || null;
      const contextPaneSurface = inspectElementSurface(contextRoot);
      const contextSidenavSurface = inspectElementSurface(contextPane?.sidenav || null);
      const surfaceTarget = host.buildSurfaceTarget({
        surfaceId: "context-pane",
        captureKind: "surface-context-pane",
        label: "Context Pane",
        element: contextRoot,
        window,
        details: {
          tabID: state?.tabID || null,
        },
      });
      const edgeState = buildEdgeAttachmentState({
        edgeMode: open ? "pane-attached" : null,
        surfaceTarget,
        minimumViableWidth: 240,
        active: open,
      });
      attachEdgeStateToSurfaceTarget(surfaceTarget, edgeState);
      return buildResult({
        actionId,
        preconditions,
        observedState: {
          ...(state || {}),
          contextPaneSurface,
          contextSidenavSurface,
          ...edgeState,
        },
        readinessChecks: [
          createCheck("context-pane-open", Boolean(state?.open) === open, {
            expected: open,
            actual: state?.open,
          }),
          createCheck("context-pane-root-observed", open ? Boolean(contextRoot) : true, {
            open,
          }),
          createCheck("context-pane-structure-observed", open
            ? hasSurfaceStructure(contextPaneSurface) || hasSurfaceStructure(contextSidenavSurface)
            : true, {
            contextPaneSurface,
            contextSidenavSurface,
          }),
          createCheck("context-pane-navigation-or-content-observed", open
            ? hasSurfaceContent(contextPaneSurface)
              || hasSurfaceContent(contextSidenavSurface)
              || Boolean(state?.hasItemContext)
              || Boolean(state?.hasNotesContext)
            : true, {
            hasItemContext: Boolean(state?.hasItemContext),
            hasNotesContext: Boolean(state?.hasNotesContext),
            contextPaneSurface,
            contextSidenavSurface,
          }),
          createCheck("context-pane-edge-geometry-ready", open
            ? hasExplicitEdgeAttachmentHandling(edgeState)
            : true, edgeState),
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
    const resolvedPaneID = typeof itemPane?.resolveSectionPaneID === "function"
      ? itemPane.resolveSectionPaneID(paneID) || paneID
      : paneID;
    const activationPolicy = normalizeActivationPolicy(payload.activationPolicy);
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
      const result = await host.selectItemPane(resolvedPaneID, {
        behavior: toPlainString(payload.behavior) || "instant",
        timeoutMs: payload.timeoutMs,
        activationPolicy,
      });
      try {
        host.getMainWindow?.()?.focus?.();
      }
      catch {}
      const paneButton = result?.button || findPaneButton(result?.container?.sidenav || null, paneID);
      const paneSurface = inspectElementSurface(result?.pane || null);
      const paneButtonSurface = inspectElementSurface(paneButton);
      const activationStrategy = toPlainString(result?.activationStrategy);
      const actionDispatched = Boolean(result?.actionDispatched);
      const actionElementObserved = result?.actionElementObserved ?? Boolean(paneButton);
      const liveUiActivation = activationPolicy !== "ui-required" || isLiveClickActivationStrategy(activationStrategy);
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
      const edgeState = buildEdgeAttachmentState({
        edgeMode: "pane-attached",
        surfaceTarget,
        minimumViableWidth: 240,
        active: Boolean(result.visible),
      });
      attachEdgeStateToSurfaceTarget(surfaceTarget, edgeState);
      return buildResult({
        actionId,
        preconditions,
        observedState: applyActivationObservedState({
          paneID,
          resolvedPaneID: resolvedPaneID !== paneID ? resolvedPaneID : null,
          visible: Boolean(result.visible),
          paneSurface,
          paneButtonSurface,
          ...edgeState,
        }, {
          activationPolicy,
          activationStrategy,
          actionElementObserved,
          actionDispatched,
        }),
        readinessChecks: [
          createCheck("pane-visible", Boolean(result.visible), {
            paneID,
            resolvedPaneID: resolvedPaneID !== paneID ? resolvedPaneID : null,
          }),
          createCheck("pane-fragment-mounted", hasSurfaceStructure(paneSurface), {
            paneSurface,
          }),
          createCheck("pane-content-observed", hasSurfaceContent(paneSurface), {
            paneSurface,
          }),
          createCheck("sidenav-button-observed", Boolean(paneButton), {
            paneID,
            paneButtonSurface,
          }),
          createCheck("activation-strategy-observed", Boolean(activationStrategy), {
            activationPolicy,
            activationStrategy,
          }),
          createCheck("action-dispatched", actionDispatched, {
            activationStrategy,
          }),
          createCheck("live-ui-activation", liveUiActivation, {
            activationPolicy,
            activationStrategy,
          }),
          createCheck("pane-edge-geometry-ready", Boolean(result.visible) && hasExplicitEdgeAttachmentHandling(edgeState), edgeState),
        ],
        surfaceTarget,
        failureKind: activationPolicy === "ui-required" && !liveUiActivation
          ? "ui-action-required"
          : null,
      });
    }
    catch (error) {
      return buildFailureResult(actionId, {
        preconditions,
        observedState: applyActivationObservedState({
          paneID,
          resolvedPaneID: resolvedPaneID !== paneID ? resolvedPaneID : null,
          error: String(error?.message || error),
        }, {
          activationPolicy,
        }),
        failureKind: "action-error",
      });
    }
  }

  async function runContextPaneSelectPane(actionId, payload = {}) {
    const paneID = toPlainString(payload.paneID);
    const tabID = toPlainString(payload.tabID);
    const activationPolicy = normalizeActivationPolicy(payload.activationPolicy);
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
        activationPolicy,
      });
      try {
        host.getMainWindow?.()?.focus?.();
      }
      catch {}
      const paneButton = result?.button || findPaneButton(result?.container?.sidenav || null, paneID);
      const paneSurface = inspectElementSurface(result?.pane || null);
      const paneButtonSurface = inspectElementSurface(paneButton);
      const activationStrategy = toPlainString(result?.activationStrategy);
      const actionDispatched = Boolean(result?.actionDispatched);
      const actionElementObserved = result?.actionElementObserved ?? Boolean(paneButton);
      const liveUiActivation = activationPolicy !== "ui-required" || isLiveClickActivationStrategy(activationStrategy);
      const surfaceEvidenceElement = result?.pane || paneButton || null;
      const surfaceTarget = host.buildSurfaceTarget({
        surfaceId: "context-pane",
        captureKind: `surface-context-pane-${paneID}`,
        label: `Context Pane ${paneID}`,
        element: surfaceEvidenceElement,
        window: host.getMainWindow?.() || null,
        details: {
          paneID,
          tabID: result.tabID || null,
          surfaceEvidenceElement: surfaceEvidenceElement === result?.pane
            ? "pane-fragment"
            : surfaceEvidenceElement === paneButton
              ? "pane-button"
              : null,
        },
      });
      const edgeState = buildEdgeAttachmentState({
        edgeMode: "pane-attached",
        surfaceTarget,
        minimumViableWidth: 240,
        active: Boolean(result.visible),
      });
      attachEdgeStateToSurfaceTarget(surfaceTarget, edgeState);
      return buildResult({
        actionId,
        preconditions,
        observedState: applyActivationObservedState({
          paneID,
          tabID: result.tabID || tabID,
          visible: Boolean(result.visible),
          paneSurface,
          paneButtonSurface,
          ...edgeState,
        }, {
          activationPolicy,
          activationStrategy,
          actionElementObserved,
          actionDispatched,
        }),
        readinessChecks: [
          createCheck("pane-visible", Boolean(result.visible), {
            paneID,
            tabID: result.tabID || tabID,
          }),
          createCheck("pane-fragment-mounted", hasSurfaceStructure(paneSurface), {
            paneSurface,
          }),
          createCheck("pane-content-observed", hasSurfaceContent(paneSurface), {
            paneSurface,
          }),
          createCheck("sidenav-button-observed", Boolean(paneButton), {
            paneID,
            tabID: result.tabID || tabID,
            paneButtonSurface,
          }),
          createCheck("activation-strategy-observed", Boolean(activationStrategy), {
            activationPolicy,
            activationStrategy,
          }),
          createCheck("action-dispatched", actionDispatched, {
            activationStrategy,
          }),
          createCheck("live-ui-activation", liveUiActivation, {
            activationPolicy,
            activationStrategy,
          }),
          createCheck("context-pane-edge-geometry-ready", Boolean(result.visible) && hasExplicitEdgeAttachmentHandling(edgeState), edgeState),
        ],
        surfaceTarget,
        failureKind: activationPolicy === "ui-required" && !liveUiActivation
          ? "ui-action-required"
          : null,
      });
    }
    catch (error) {
      return buildFailureResult(actionId, {
        preconditions,
        observedState: applyActivationObservedState({
          paneID,
          tabID,
          error: String(error?.message || error),
        }, {
          activationPolicy,
        }),
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
      const contextRoot = contextPane?.context || window?.document?.getElementById?.("zotero-context-pane") || null;
      const contextPaneSurface = inspectElementSurface(contextRoot);
      const contextSidenavSurface = inspectElementSurface(contextPane?.sidenav || null);
      const surfaceTarget = host.buildSurfaceTarget({
        surfaceId: "context-pane",
        captureKind: "surface-reader-context-pane",
        label: "Reader Context Pane",
        element: contextRoot,
        window,
        details: {
          target,
        },
      });
      const edgeState = buildEdgeAttachmentState({
        edgeMode: open ? "pane-attached" : null,
        surfaceTarget,
        minimumViableWidth: 240,
        active: open,
      });
      attachEdgeStateToSurfaceTarget(surfaceTarget, edgeState);
      return buildResult({
        actionId,
        preconditions,
        observedState: {
          ...(snapshot || {}),
          contextPaneSurface,
          contextSidenavSurface,
          ...edgeState,
        },
        readinessChecks: [
          createCheck("reader-context-pane-open", snapshot?.contextPaneOpen === null || snapshot?.contextPaneOpen === open, {
            expected: open,
            actual: snapshot?.contextPaneOpen ?? null,
          }),
          createCheck("reader-context-pane-root-observed", open ? Boolean(contextRoot) : true, {
            open,
          }),
          createCheck("reader-context-pane-structure-observed", open
            ? hasSurfaceStructure(contextPaneSurface) || hasSurfaceStructure(contextSidenavSurface)
            : true, {
            contextPaneSurface,
            contextSidenavSurface,
          }),
          createCheck("reader-context-pane-navigation-or-content-observed", open
            ? hasSurfaceContent(contextPaneSurface) || hasSurfaceContent(contextSidenavSurface)
            : true, {
            contextPaneSurface,
            contextSidenavSurface,
          }),
          createCheck("reader-context-pane-edge-geometry-ready", open
            ? hasExplicitEdgeAttachmentHandling(edgeState)
            : true, edgeState),
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
    const activationPolicy = normalizeActivationPolicy(payload.activationPolicy);
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
        activationPolicy,
      });
      const surfaceElement = result?.panel || result?.button || null;
      const sidebarButtonSurface = inspectElementSurface(result?.button || null);
      const sidebarPanelSurface = inspectElementSurface(result?.panel || null);
      const activationStrategy = toPlainString(result?.activationStrategy);
      const actionDispatched = Boolean(result?.actionDispatched);
      const actionElementObserved = result?.actionElementObserved ?? Boolean(result?.button);
      const sidebarDomOpen = readReaderSidebarDomOpen(result);
      const sidebarOpenObserved = result?.uiState?.sidebarOpen === false
        ? sidebarDomOpen
        : result?.uiState?.sidebarOpen ?? sidebarDomOpen;
      const liveUiActivation = activationPolicy !== "ui-required" || isLiveClickActivationStrategy(activationStrategy);
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
          surfaceEvidenceElement: surfaceElement === result?.panel
            ? "sidebar-panel"
            : surfaceElement === result?.button
              ? "sidebar-button"
              : null,
        },
      });
      const edgeState = buildEdgeAttachmentState({
        edgeMode: "sidebar-attached",
        surfaceTarget,
        minimumViableWidth: 240,
        fallbackWidth: result?.uiState?.sidebarWidth,
        fallbackSource: "reader-ui-state-sidebarWidth",
        active: Boolean(surfaceElement) || sidebarOpenObserved === true || Number(result?.uiState?.sidebarWidth) > 0,
      });
      attachEdgeStateToSurfaceTarget(surfaceTarget, edgeState);
      return buildResult({
        actionId,
        preconditions,
        observedState: applyActivationObservedState({
          view,
          sidebarView: result?.uiState?.sidebarView ?? null,
          sidebarOpen: result?.uiState?.sidebarOpen ?? null,
          sidebarDomOpen,
          sidebarOpenObserved,
          buttonFound: Boolean(result?.button),
          panelFound: Boolean(result?.panel),
          sidebarButtonSurface,
          sidebarPanelSurface,
          ...edgeState,
        }, {
          activationPolicy,
          activationStrategy,
          actionElementObserved,
          actionDispatched,
        }),
        readinessChecks: [
          createCheck("sidebar-view-selected", result?.uiState?.sidebarView === view, {
            expected: view,
            actual: result?.uiState?.sidebarView ?? null,
          }),
          createCheck("sidebar-open-or-unknown", sidebarOpenObserved !== false, {
            actual: result?.uiState?.sidebarOpen ?? null,
            domActual: sidebarDomOpen,
            observed: sidebarOpenObserved,
          }),
          createCheck("sidebar-surface-observed", Boolean(result?.button || result?.panel), {
            view,
          }),
          createCheck("sidebar-surface-structure-observed", hasSurfaceStructure(sidebarPanelSurface)
            || hasSurfaceStructure(sidebarButtonSurface)
            || hasSurfaceContent(sidebarButtonSurface), {
            sidebarButtonSurface,
            sidebarPanelSurface,
          }),
          createCheck("sidebar-surface-content-observed", hasSurfaceContent(sidebarPanelSurface)
            || hasSurfaceContent(sidebarButtonSurface), {
            sidebarButtonSurface,
            sidebarPanelSurface,
          }),
          createCheck("sidebar-edge-geometry-ready", hasExplicitEdgeAttachmentHandling(edgeState), edgeState),
          createCheck("activation-strategy-observed", Boolean(activationStrategy), {
            activationPolicy,
            activationStrategy,
          }),
          createCheck("action-dispatched", actionDispatched, {
            activationStrategy,
          }),
          createCheck("live-ui-activation", liveUiActivation, {
            activationPolicy,
            activationStrategy,
          }),
        ],
        surfaceTarget,
        failureKind: activationPolicy === "ui-required" && !liveUiActivation
          ? "ui-action-required"
          : null,
      });
    }
    catch (error) {
      return buildFailureResult(actionId, {
        preconditions,
        observedState: applyActivationObservedState({
          target,
          view,
          error: String(error?.message || error),
        }, {
          activationPolicy,
        }),
        failureKind: "action-error",
      });
    }
  }

  async function runReaderToolbarTriggerButton(actionId, payload = {}) {
    const target = normalizeTarget(payload);
    const selector = toPlainString(payload.selector);
    const preconditions = [
      createCheck("reader.findToolbarElement", typeof reader?.findToolbarElement === "function"),
      createCheck("reader-target", target !== null && target !== undefined, { target }),
      createCheck("selector", Boolean(selector), { selector }),
    ];
    if (preconditions.some((entry) => entry.ok === false)) {
      return buildFailureResult(actionId, {
        preconditions,
        failureKind: "precondition-failed",
      });
    }

    try {
      const button = await host.waitFor(
        () => reader.findToolbarElement(target, {
          selector,
        }) || null,
        {
          timeoutMs: payload.timeoutMs ?? 5000,
          intervalMs: 50,
          message: `Timed out waiting for reader toolbar button '${selector}'`,
        },
      );
      const toolbarSurface = inspectElementSurface(button);
      const liveActivation = triggerLiveElement(button);
      const surfaceTarget = host.buildSurfaceTarget({
        surfaceId: "render-toolbar",
        captureKind: `surface-reader-toolbar-action-${selector}`,
        label: "Reader Toolbar Button",
        element: button,
        window: button?.ownerGlobal || button?.ownerDocument?.defaultView || null,
        details: {
          target,
          selector,
        },
      });
      return buildResult({
        actionId,
        preconditions,
        observedState: applyActivationObservedState({
          target,
          selector,
          toolbarSurface,
        }, {
          activationPolicy: "host-first",
          activationStrategy: liveActivation.activationStrategy,
          actionElementObserved: Boolean(button),
          actionDispatched: liveActivation.actionDispatched,
        }),
        readinessChecks: [
          createCheck("toolbar-button-observed", Boolean(button), {
            selector,
          }),
          createCheck("toolbar-button-actionable", isActionableSurface(toolbarSurface), {
            toolbarSurface,
          }),
          createCheck("activation-strategy-observed", Boolean(liveActivation.activationStrategy), {
            activationStrategy: liveActivation.activationStrategy,
          }),
          createCheck("action-dispatched", liveActivation.actionDispatched, {
            activationStrategy: liveActivation.activationStrategy,
          }),
        ],
        surfaceTarget,
      });
    }
    catch (error) {
      return buildFailureResult(actionId, {
        preconditions,
        observedState: applyActivationObservedState({
          target,
          selector,
          error: String(error?.message || error),
        }, {
          activationPolicy: "host-first",
        }),
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
      const menuSurface = inspectElementSurface(liveState?.menuElem || null);
      const popupSurface = inspectElementSurface(liveState?.popupElem || popup || null);
      const popupElement = liveState?.popupElem || popup || null;
      const menuElement = liveState?.menuElem || null;
      const popupRect = typeof host?.getElementScreenRect === "function"
        ? host.getElementScreenRect(popupElement)
        : null;
      const menuRect = typeof host?.getElementScreenRect === "function"
        ? host.getElementScreenRect(menuElement)
        : null;
      const surfaceElement = popupRect
        ? popupElement
        : menuRect
          ? menuElement
          : popupElement || menuElement || null;
      const surfaceTarget = host.buildSurfaceTarget({
        surfaceId: "menu-item",
        captureKind: `surface-menu-${target}-${menuID}`,
        label: `Menu ${menuID}`,
        element: surfaceElement,
        window: (
          surfaceElement?.ownerGlobal
          || surfaceElement?.ownerDocument?.defaultView
          || popup?.ownerGlobal
          || popup?.ownerDocument?.defaultView
          || liveState?.menuElem?.ownerGlobal
          || liveState?.menuElem?.ownerDocument?.defaultView
          || null
        ),
        details: {
          menuID,
          target,
          menuPath: menuPath || null,
          surfaceEvidenceElement: surfaceElement === popupElement
            ? "menu-popup"
            : surfaceElement === menuElement
              ? "menu-item"
              : null,
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
          menuSurface,
          popupSurface,
        },
        readinessChecks: [
          createCheck("popup-open", Boolean(popup)),
          createCheck("live-menu-state-observed", Boolean(liveState), {
            menuID,
            target,
          }),
          createCheck("menu-element-visible", Boolean(liveState?.menuElem), {
            menuID,
          }),
          createCheck("menu-item-actionable", isActionableSurface(menuSurface), {
            menuSurface,
          }),
          createCheck("menu-popup-structure-observed", hasSurfaceStructure(popupSurface)
            || Number(liveState?.itemCount) > 0, {
            popupSurface,
            itemCount: liveState?.itemCount ?? null,
          }),
          createCheck("menu-content-observed", hasSurfaceContent(menuSurface)
            || hasSurfaceContent(popupSurface)
            || Number(liveState?.itemCount) > 0, {
            menuSurface,
            popupSurface,
            itemCount: liveState?.itemCount ?? null,
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
    const activation = dispatchMenuCommand(liveState?.menuElem);
    let popupHidden = false;
    if (typeof host?.simulatePopupClose === "function") {
      try {
        await host.simulatePopupClose(liveState?.popupElem || null);
        popupHidden = true;
      }
      catch {}
    }
    return buildResult({
      actionId,
      preconditions: showResult.preconditions || [],
      observedState: applyActivationObservedState({
        ...(showResult.observedState || {}),
        commandDispatched: activation.actionDispatched,
        popupHidden,
      }, {
        activationPolicy: "host-first",
        activationStrategy: activation.activationStrategy,
        actionElementObserved: Boolean(liveState?.menuElem),
        actionDispatched: activation.actionDispatched,
      }),
      readinessChecks: [
        ...(Array.isArray(showResult.readiness?.checks) ? showResult.readiness.checks : []),
        createCheck("activation-strategy-observed", Boolean(activation.activationStrategy), {
          activationStrategy: activation.activationStrategy,
        }),
        createCheck("command-dispatched", activation.actionDispatched, {
          menuID,
        }),
        createCheck("popup-hidden-replayed", popupHidden, {
          menuID,
        }),
      ],
      surfaceTarget: showResult.surfaceTarget,
    });
  }

  async function runWindowOpenReactDemo(actionId, payload = {}) {
    const preconditions = [
      createCheck("openReactDemoWindow", typeof openReactDemoWindow === "function"),
    ];
    if (preconditions.some((entry) => entry.ok === false)) {
      return buildFailureResult(actionId, {
        preconditions,
        failureKind: "precondition-failed",
      });
    }

    try {
      const opened = await openReactDemoWindow(payload);
      return buildResult({
        actionId,
        preconditions,
        observedState: {
          bundleId: "react-ui",
          reused: opened?.reused === true,
          ready: opened?.ready === true,
          href: toPlainString(opened?.href || opened?.window?.location?.href),
        },
        readinessChecks: [
          createCheck("window-observed", Boolean(opened?.window)),
          createCheck("window-ready", opened?.ready === true),
          createCheck("surface-target", Boolean(opened?.surfaceTarget)),
        ],
        surfaceTarget: opened?.surfaceTarget || null,
      });
    } catch (error) {
      return buildFailureResult(actionId, {
        preconditions,
        observedState: {
          message: String(error?.message || error),
        },
        failureKind: "action-failed",
      });
    }
  }

  async function runHostAction(actionId, payload = {}) {
    const descriptor = getHostActionDescriptor(actionId, {
      optionalBundles,
    });
    if (!descriptor) {
      return buildFailureResult(String(actionId || "unknown"), {
        failureKind: "unknown-action",
      });
    }
    if (!isExecutableHostAction(actionId, { optionalBundles })) {
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
      case "preferences.selectTab":
        return await runPreferencesSelectTab(actionId, payload);
      case "preferences.setCheckbox":
        return await runPreferenceControlAction(actionId, payload, "checkbox");
      case "preferences.setTextbox":
        return await runPreferenceControlAction(actionId, payload, "textbox");
      case "preferences.selectMenulist":
        return await runPreferenceControlAction(actionId, payload, "menulist");
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
      case "reader.toolbar.triggerButton":
        return await runReaderToolbarTriggerButton(actionId, payload);
      case "reader.sidebar.selectView":
        return await runReaderSidebarSelectView(actionId, payload);
      case "menu.show":
        return await runMenuShow(actionId, payload);
      case "menu.trigger":
        return await runMenuTrigger(actionId, payload);
      case "window.openReactDemo":
        return await runWindowOpenReactDemo(actionId, payload);
      default:
        return buildFailureResult(actionId, {
          failureKind: "unsupported-action",
        });
    }
  }

  return {
    listHostActions() {
      return listHostActionDescriptors({
        optionalBundles,
      });
    },
    async runHostAction(actionId, payload = {}) {
      return await runHostAction(actionId, payload);
    },
  };
}
